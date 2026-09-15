package hikvision

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type digestSession struct {
	realm     string
	nonce     string
	qop       string
	opaque    string
	algorithm string
	ncCount   int
}

type cachedSnapshot struct {
	data      []byte
	timestamp time.Time
}

type CameraClient struct {
	client        *http.Client
	mu            sync.Mutex
	digestCache   map[string]*digestSession
	snapshotCache map[string]*cachedSnapshot
}

func NewCameraClient() *CameraClient {
	return &CameraClient{
		client: &http.Client{
			Timeout: 6 * time.Second,
		},
		digestCache:   make(map[string]*digestSession),
		snapshotCache: make(map[string]*cachedSnapshot),
	}
}

// FetchSnapshot fetches a live JPEG snapshot from the camera with candidate path fallbacks.
func (c *CameraClient) FetchSnapshot(ip, username, password string, isISAPI bool) ([]byte, error) {
	var candidatePaths []string
	if isISAPI {
		candidatePaths = []string{
			"/ISAPI/Streaming/Channels/101/picture",
			"/ISAPI/Streaming/Channels/102/picture",
			"/Streaming/channels/102/picture",
			"/Streaming/channels/101/picture",
		}
	} else {
		candidatePaths = []string{
			"/Streaming/channels/102/picture",
			"/ISAPI/Streaming/Channels/101/picture",
			"/Streaming/channels/101/picture",
			"/ISAPI/Streaming/Channels/102/picture",
		}
	}

	var lastErr error
	for _, p := range candidatePaths {
		url := fmt.Sprintf("http://%s%s", ip, p)
		data, err := c.doDigestGet(url, username, password)
		if err == nil && len(data) > 0 {
			// Save in cache
			c.mu.Lock()
			c.snapshotCache[ip] = &cachedSnapshot{
				data:      data,
				timestamp: time.Now(),
			}
			c.mu.Unlock()
			return data, nil
		}
		lastErr = err
	}

	// If live fetch failed, check if we have a recent cached frame (<30s old)
	c.mu.Lock()
	if cached, ok := c.snapshotCache[ip]; ok && time.Since(cached.timestamp) < 30*time.Second {
		c.mu.Unlock()
		return cached.data, nil
	}
	c.mu.Unlock()

	return nil, fmt.Errorf("snapshot fetch failed for %s: %w", ip, lastErr)
}

// AutoDetect probes the camera to automatically identify whether it uses ISAPI or Legacy endpoints.
func (c *CameraClient) AutoDetect(ip, username, password string) (bool, string, error) {
	// 1. Try ISAPI endpoints first (standard on Hikvision 5.5+ and HiLook)
	isapiPaths := []string{
		"/ISAPI/System/deviceInfo",
		"/ISAPI/Streaming/Channels/101/picture",
		"/ISAPI/Streaming/Channels/102/picture",
	}
	for _, p := range isapiPaths {
		url := fmt.Sprintf("http://%s%s", ip, p)
		data, err := c.doDigestGet(url, username, password)
		if err == nil && len(data) > 0 {
			return true, fmt.Sprintf("Success! Connected via ISAPI protocol (%d bytes received)", len(data)), nil
		}
	}

	// 2. Try Legacy endpoints (Hikvision older firmware)
	legacyPaths := []string{
		"/Streaming/channels/102/picture",
		"/Streaming/channels/101/picture",
		"/System/deviceInfo",
	}
	for _, p := range legacyPaths {
		url := fmt.Sprintf("http://%s%s", ip, p)
		data, err := c.doDigestGet(url, username, password)
		if err == nil && len(data) > 0 {
			return false, fmt.Sprintf("Success! Connected via Legacy protocol (%d bytes received)", len(data)), nil
		}
	}

	return false, "", fmt.Errorf("could not connect to camera at %s with provided credentials", ip)
}

// TestConnection tests whether the camera is reachable and auto-detects ISAPI vs Legacy protocol.
func (c *CameraClient) TestConnection(ip, username, password string) (bool, string, error) {
	return c.AutoDetect(ip, username, password)
}

func (c *CameraClient) doDigestGet(targetURL, username, password string) ([]byte, error) {
	cacheKey := fmt.Sprintf("%s@%s", username, targetURL)

	c.mu.Lock()
	session := c.digestCache[cacheKey]
	c.mu.Unlock()

	// 1. If we have a cached digest session, try sending authenticated request first
	if session != nil {
		data, statusCode, err := c.sendDigestRequest(targetURL, username, password, session)
		if err == nil && statusCode == http.StatusOK {
			return data, nil
		}
		// If failed with 401, nonce may have expired; clear and re-challenge
		if statusCode == http.StatusUnauthorized {
			c.mu.Lock()
			delete(c.digestCache, cacheKey)
			c.mu.Unlock()
		}
	}

	// 2. Initial request (unauthenticated or challenge refresh)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return io.ReadAll(resp.Body)
	}

	if resp.StatusCode != http.StatusUnauthorized {
		return nil, fmt.Errorf("camera returned status %d", resp.StatusCode)
	}

	authHeader := resp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		// Try Basic auth fallback
		reqBasic, _ := http.NewRequest("GET", targetURL, nil)
		reqBasic.SetBasicAuth(username, password)
		respBasic, err := c.client.Do(reqBasic)
		if err != nil {
			return nil, err
		}
		defer respBasic.Body.Close()
		if respBasic.StatusCode == http.StatusOK {
			return io.ReadAll(respBasic.Body)
		}
		return nil, fmt.Errorf("authentication failed (status %d)", respBasic.StatusCode)
	}

	// 3. Parse Digest challenge
	digestParams := parseDigestHeader(authHeader)
	newSession := &digestSession{
		realm:     digestParams["realm"],
		nonce:     digestParams["nonce"],
		qop:       digestParams["qop"],
		opaque:    digestParams["opaque"],
		algorithm: digestParams["algorithm"],
		ncCount:   0,
	}
	if newSession.algorithm == "" {
		newSession.algorithm = "MD5"
	}

	c.mu.Lock()
	c.digestCache[cacheKey] = newSession
	c.mu.Unlock()

	data, statusCode, err := c.sendDigestRequest(targetURL, username, password, newSession)
	if err != nil {
		return nil, err
	}
	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("digest auth failed with status %d", statusCode)
	}
	return data, nil
}

func (c *CameraClient) sendDigestRequest(targetURL, username, password string, session *digestSession) ([]byte, int, error) {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, 0, err
	}

	session.ncCount++
	nc := fmt.Sprintf("%08x", session.ncCount)
	cnonce := randomHex(8)
	uri := req.URL.RequestURI()

	ha1 := md5Hex(fmt.Sprintf("%s:%s:%s", username, session.realm, password))
	ha2 := md5Hex(fmt.Sprintf("%s:%s", "GET", uri))

	var response string
	if strings.Contains(session.qop, "auth") {
		response = md5Hex(fmt.Sprintf("%s:%s:%s:%s:auth:%s", ha1, session.nonce, nc, cnonce, ha2))
	} else {
		response = md5Hex(fmt.Sprintf("%s:%s:%s", ha1, session.nonce, ha2))
	}

	authVal := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		username, session.realm, session.nonce, uri, response)

	if strings.Contains(session.qop, "auth") {
		authVal += fmt.Sprintf(`, qop="auth", nc=%s, cnonce="%s"`, nc, cnonce)
	}
	if session.opaque != "" {
		authVal += fmt.Sprintf(`, opaque="%s"`, session.opaque)
	}

	req.Header.Set("Authorization", authVal)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	return data, resp.StatusCode, err
}

func parseDigestHeader(header string) map[string]string {
	result := make(map[string]string)
	if !strings.HasPrefix(header, "Digest ") {
		return result
	}
	header = strings.TrimPrefix(header, "Digest ")
	parts := strings.Split(header, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			k := strings.TrimSpace(kv[0])
			v := strings.Trim(strings.TrimSpace(kv[1]), `"`)
			result[k] = v
		}
	}
	return result
}

func md5Hex(data string) string {
	h := md5.Sum([]byte(data))
	return hex.EncodeToString(h[:])
}

func randomHex(n int) string {
	bytes := make([]byte, n)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
