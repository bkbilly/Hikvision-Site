
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

	</style>

	<!-- Load jquery for ajax support -->
	<script src="http://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.min.js"></script>

	<script src="http://visjs.org/dist/vis.js"></script>
	<link href="http://visjs.org/dist/vis.css" rel="stylesheet" type="text/css" />
</head>
<body>
<p>
</p>
<video id="video"  controls>
	<source id="source" src="" type="video/mp4">
</video>


<div id="visualization"></div>

<script type="text/javascript">
	// ----==== Init Global Variables ====----
	var start = new Date();
	start.setDate(start.getDate() - 1);
	start = start.toLocaleString();
	var end = new Date();
	end = end.toLocaleString();

	var options = {
		dataAttributes: 'all',
		stack: false
	};
	var container = document.getElementById('visualization');
	var groups = [{
			id: 0,
			content: 'Saloni'
		},
		{
			id: 1,
			content: 'Kouzina'
		}
	];
	var timeline = new vis.Timeline(container, [], groups, options);

	timeline.addCustomTime(start, 'start');
	timeline.addCustomTime(end, 'end');

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
	$('#video').on('suspend', function (event) {
		console.log('suspend');
		$(this).removeClass('loading');
		$(this).attr("poster", '');
	});
	$('#video').on('canplay', function (event) {
		console.log('canplay');
		$(this).removeClass('loading');
		$(this).attr('poster', '');
	});

	// ----==== Timeline Events ====----
	timeline.on('timechanged', function (properties) {
		if(properties.id === 'start'){
			start = properties.time.toLocaleString();
		} else if(properties.id === 'end'){
			end = properties.time.toLocaleString();
		}
		loadCamData(start, end, groups);
	});
    timeline.on('select', function (properties) {
		var selectedDOM = properties.event.target;

		if(selectedDOM.getAttribute('data-datadir') === null){
			selectedDOM = selectedDOM.parentNode;
			if(selectedDOM.getAttribute('data-datadir') === null){
				selectedDOM = selectedDOM.parentNode;
			}
		}

		datadir = selectedDOM.getAttribute('data-datadir');
		file = selectedDOM.getAttribute('data-file');
		videostart = selectedDOM.getAttribute('data-videostart');
		videoend = selectedDOM.getAttribute('data-videoend');
		camera = selectedDOM.getAttribute('data-group');

		streamURL = "dispatcher.php?action=getVideo&camera="+camera+"&datadir="+datadir+"&file="+file+"&start="+videostart+"&end="+videoend;
		var video = document.getElementById('video');
		var source = document.getElementById('source');
		source.setAttribute("src", streamURL);
		video.load();
		video.play();
    });

	loadCamData(start, end, groups);
	

	function loadCamData(start, end, groups){
		var cameras = [];
		for (var i = 0; i < groups.length; i++) {
			camera = groups[i]['id'];
			cameras.push(camera);
		};
		cameras = JSON.stringify(cameras);

		$.ajax({
			url: 'dispatcher.php?action=getAllEvents&cameras='+cameras+'&start='+start+'&end='+end,
			success: function (data) {
				// hide the "loading..." message
				var items = JSON.parse(data);
				timeline.setItems(new vis.DataSet(items));
				// timeline.fit();
			},
			error: function (err) {
				console.log('Error', err);
			}
		});
	}
</script>
</body>
</html>