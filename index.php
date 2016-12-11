
<!DOCTYPE HTML>
<html>
<head>
	<title>Timeline | External data</title>

	<!-- Load jquery for ajax support -->
	<script src="packages/jquery.min.js"></script>
	<script src="packages/vis.js"></script>
	<link href="packages/vis.css" rel="stylesheet" type="text/css" />

	<script src="packages/jquery.qtip.min.js"></script>
	<link href="packages/jquery.qtip.min.css" rel="stylesheet" type="text/css" />

	<script src="myjs.js"></script>
	<link href="mycss.css" rel="stylesheet" type="text/css" />

</head>
<body class="gradient-pattern">


		<div class="Menu">
			<input type="button" id="zoomIn" value="Zoom in"/>
			<input type="button" id="zoomOut" value="Zoom out"/>
			<select id="resolution">
				<option value="null" selected>Original</option>
				<option value="1920x1080">1920x1080</option>
				<option value="1280x720">1280x720</option>
				<option value="640x360">640x360</option>
			</select>
			<input type="range" id="myRange" min="-20" max="20" step="0.1" value="1">
			<label id="speedNum"></label>
		</div>
	<div id="visualization">
	</div>


	<div id="video-container">
		<video id="video" controls>
			<source  id="source" src="" type="video/mp4">
		</video>
		<div id="loading" class="loader"></div>
	</div>


</body>
</html>