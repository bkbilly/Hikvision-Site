
<!DOCTYPE HTML>
<html>
<head>
	<title>Timeline | External data</title>
	<meta name="viewport" content="width=device-width">
	<meta name="mobile-web-app-capable" content="yes">

	<!-- Load jquery for ajax support -->
	<script src="packages/jquery.min.js"></script>
	<script src="packages/vis-timeline-graph2d.min.js"></script>
	<link href="packages/vis-timeline-graph2d.min.css" rel="stylesheet" type="text/css" />

	<script src="packages/jquery.qtip.min.js"></script>
	<link href="packages/jquery.qtip.min.css" rel="stylesheet" type="text/css" />

	<script src="myjs.js"></script>
	<link href="mycss.css" rel="stylesheet" type="text/css" />

</head>
<body class="gradient-pattern">

	<div id="unregistered">
		<form action="javascript:login()">
			<div class="form-container">
				<label><b>Username</b></label>
				<input type="text" placeholder="Enter Username" id="inputUser" name="user" required>
				<label><b>Password</b></label>
				<input type="password" placeholder="Enter Password" id="inputPass" name="password" required>
				<button type="submit">Login</button>

			</div>
		</form>
	</div>

	<div id="registered">
		<div class="Menu">
			<input type="button" id="zoomIn" value="Zoom in"/>
			<input type="button" id="zoomOut" value="Zoom out"/>
			<select id="resolution">
				<option value="null" selected>Original</option>
				<option value="1920x1080">1920x1080</option>
				<option value="1280x720">1280x720</option>
				<option value="640x360">640x360</option>
				<option value="480x270">480x270</option>
			</select>
			<input type="range" id="myRange" min="-20" max="20" step="0.1" value="1">
			<label id="speedNum"></label>
			<button type="button" class="logoutbtn" onclick="logout()">Logout</button>
		</div>

		<div id="visualization"></div>
		<div id="loading" class="loader"></div>

		<div id="video-container">
			<video id="video" controls>
				<source id="source" src="" type="video/mp4">
			</video>
			<img id='liveview' src="dispatcher.php?action=videopicture"/>
		</div>
	</div>


</body>
</html>
