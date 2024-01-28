# README

This Web Application is a nice UI for all your hikvision cameras. It supports Login and it is using native HTML5 without the need to install any other plugin for the client.

![Preview of the interface](images/spicam.png)

### Configure

*.htaccess:*

* At the **SetEnv AuthUser** & **SetEnv AuthPass** change it into your own desire.
* At the **SetEnv camPaths** add a comma sepperated list of each path to your cameras **info.bin** files.
* At the **SetEnv camNames** add a comma sepperated list of name the camera names which should be the same size as the camPaths.
* At the **SetEnv camIPs** add a comma sepperated list of the IPs of each camera.
* At the **SetEnv camAuths** add a comma sepperated list of the usernames/passwords for the authentication in this format: "admin:password"
* At the **SetEnv camVersions** *(optional)* add a comma sepperated list of whether the Hikvision/HiLook cameras are on newer firmware and need /ISAPI/ paths. 0 for old, 1 for ISAPI/new - like "0,1" for an old and new camera, or "1,1" for two new cameras.


### Dependencies
  * PHP version 5.6 or newer for the unpack to support 64 bit format
  * php-imagick for the image preview
  * php-sqlite3 for reading the new data structure
  * Enable .htaccess support on your http server

### Docker
You can install it using docker from here: https://hub.docker.com/r/bkbillybk/hikvision_site

### Credits

Used a modified version of libHikvision library by Dave Hope, available at https://github.com/davehope/libHikvision
