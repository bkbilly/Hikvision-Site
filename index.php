
<!DOCTYPE HTML>
<html>
<head>
	<title>Timeline | External data</title>

	<style type="text/css">
		body, html {
			font-family: sans-serif;
		}
		video.loading {
			background: black;
		}
		#video{
			position: absolute;
			margin-bottom: 8em;
			height: 80%;
			max-width: 90%;
		}
		#visualization{
			position: fixed;
			bottom: 0;
			width: 100%;
		}
		.Menu {
			position: absolute;
			bottom: 0;
			right: 0;
			margin: 10px;
			z-index: 9999;
		}

	</style>

	<!-- Load jquery for ajax support -->
	<script src="packages/jquery.min.js"></script>
	<script src="packages/vis.js"></script>
	<link href="packages/vis.css" rel="stylesheet" type="text/css" />

	<script src="packages/jquery.qtip.min.js"></script>
	<link href="packages/jquery.qtip.min.css" rel="stylesheet" type="text/css" />
</head>
<body>
<p>
</p>
<video id="video"  controls>
	<source id="source" src="" type="video/mp4">
</video>


<div id="visualization">
	<div class="Menu">
		<input type="button" id="zoomIn" value="Zoom in"/>
		<input type="button" id="zoomOut" value="Zoom out"/>
		<input type="button" id="speedDown" value="Speed Down"/>
		<label id="speedNum"></label>
		<input type="button" id="speedUp" value="Speed Up"/>
		<select id="resolution">
			<option value="null" selected>Original</option>
			<option value="1920x1080">1920x1080</option>
			<option value="1280x720">1280x720</option>
			<option value="640x360">640x360</option>
		</select>
	</div>
</div>

<script type="text/javascript">
	// ----==== Init Global Variables ====----
	var selectedEvent;
	var timeline;
	var start;
	var end;
	var groups;

	initProject();

	document.getElementById('zoomIn').onclick = function(){ zoom(-0.3); };
	document.getElementById('zoomOut').onclick = function(){ zoom( 0.3); };
	document.getElementById('speedDown').onclick = function(){ speed(-0.2); };
	document.getElementById('speedUp').onclick = function(){ speed( 0.2); };

	// ----==== Video Events ====----
	$('#video').on('loadstart', function (event) {
		$(this).addClass('loading');
		$(this).attr("poster", "loader.gif");
	});
	$('#video').on('error', function (event) {
		console.log('error');
		$(this).removeClass('loading');
		$(this).attr("poster", '');
	});
	$('#video').on('canplay', function (event) {
		$(this).removeClass('loading');
		$(this).attr('poster', '');
	});
	$('#video').on('ended', function (event) {
		var tmpEvent = findNextEvent(timeline.getSelection());
		if(tmpEvent !== undefined && tmpEvent !== selectedEvent){
			timeline.setSelection(tmpEvent, {focus: true});
			selectedEvent = timeline.getSelection();
			selectEventPlay(selectedEvent);
		}
	});

	// ----==== Timeline Events ====----
	timeline.on('timechanged', function (properties) {
		if(properties.id === 'start'){
			start = properties.time;
		} else if(properties.id === 'end'){
			end = properties.time;
		}
		loadCamData(start, end, groups);
	});
	timeline.on('select', function (properties) {
		if(properties.items.length === 0){
			timeline.setSelection(selectedEvent);
			return 0;
		}
		selectedEvent = timeline.getSelection();
		selectEventPlay(selectedEvent);
	});
	$(document).on("mouseenter", '.vis-item', function ($e) {
		$(this).qtip({
			show: {ready: true},
			content: {
				text: 'loading...',
				ajax: {
					url: 'dispatcher.php?action=get',
					type: 'GET'
				}
			},
			position: {
				effect: false,
				my: 'top center',
			}
		});
	});


	function initProject(){
		var container = document.getElementById('visualization');
		groups = [{
				id: 0,
				content: 'Saloni'
			},
			{
				id: 1,
				content: 'Kouzina'
			}
		];
		var options = {
			dataAttributes: 'all',
			stack: false
		};
		timeline = new vis.Timeline(container, [], groups, options);

		start = new Date();
		start.setDate(start.getDate() - 1);
		end = new Date();

		timeline.addCustomTime(start, 'start');
		timeline.addCustomTime(end, 'end');
		timeline.setWindow({
			start: start,
			end:   end
		});
		speed(0);
		loadCamData(start, end, groups);
	}
	function findNextEvent(dataID){
		var timeEvent = timeline.itemsData.get(dataID)[0];
		var timeEventStart = new Date(timeEvent.start);
		var timeEventGroup = timeEvent.group;

		var allEvents = timeline.itemsData.get();
		var numEvents = allEvents.length;

		var maxEvents = [];
		for (var i = 0; i < numEvents; i++) {
			var tmpEvent = allEvents[i];
			var tmpEventStart = new Date(tmpEvent.start);
			if(timeEventGroup === tmpEvent.group){
				if(timeEventStart < tmpEventStart){
					maxEvents.push(tmpEvent);
				}
			}
		};
		if(maxEvents.length === 0)
			return undefined;

		var timeEventSelect = [maxEvents[0].id];
		timeEventStart = new Date(maxEvents[0].start);
		for (var i = 0; i < maxEvents.length; i++) {
			var tmpEvent = maxEvents[i];
			var tmpEventStart = new Date(tmpEvent.start);
			if(tmpEventStart < timeEventStart){
				timeEventSelect = [tmpEvent.id];
			} else {
				timeEventStart = tmpEventStart;
			}
		};

		return timeEventSelect
	}
	function selectEventPlay(selectedEvent){
		var selectedDOM = $('div[data-id="'+selectedEvent+'"]');
		datadir = selectedDOM.attr('data-datadir');
		file = selectedDOM.attr('data-file');
		videostart = selectedDOM.attr('data-videostart');
		videoend = selectedDOM.attr('data-videoend');
		camera = selectedDOM.attr('data-group');
		resolution = $("#resolution").val();
		console.log(resolution);

		streamURL = "dispatcher.php?action=getVideo&camera="+camera+"&datadir="+datadir+"&file="+file+"&start="+videostart+"&end="+videoend+"&resolution="+resolution;
		var video = document.getElementById('video');
		var source = document.getElementById('source');
		source.setAttribute("src", streamURL);
		video.load();
		video.play();
	}
	function loadCamData(start, end, groups){
		timestampStart = Math.round(start.getTime()/1000) - (start.getTimezoneOffset() * 60);
		timestampEnd = Math.round(end.getTime()/1000) - (end.getTimezoneOffset() * 60);
		var cameras = [];
		for (var i = 0; i < groups.length; i++) {
			camera = groups[i]['id'];
			cameras.push(camera);
		};
		cameras = JSON.stringify(cameras);

		$.ajax({
			url: 'dispatcher.php?action=getAllEvents&cameras='+cameras+'&start='+timestampStart+'&end='+timestampEnd,
			success: function (data) {
				var items = JSON.parse(data);
				timeline.setItems(new vis.DataSet(items));
				// timeline.fit();
			},
			error: function (err) {
				console.log('Error', err);
			}
		});
	}
	function zoom(percentage) {
		var range = timeline.getWindow();
		var interval = range.end - range.start;

		timeline.setWindow({
			start: range.start.valueOf() - interval * percentage,
			end:   range.end.valueOf()   + interval * percentage
		});
	}
	function speed(newSpeed) {
		videoID = document.getElementById("video");
		videoID.defaultPlaybackRate = videoID.defaultPlaybackRate + newSpeed;
		videoID.playbackRate = videoID.playbackRate + newSpeed;
		document.getElementById('speedNum').textContent =  Math.round(videoID.playbackRate * 100) / 100;
	}

</script>
</body>
</html>