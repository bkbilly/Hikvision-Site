var selectedEvent;
var timeline;
var start;
var end;
var groups;


$( document ).ready(function() {
	$.ajax({
		url: 'dispatcher.php?action=usrStatus',
		success: function (data) {
			var logged = JSON.parse(data);
			if (logged.connected === false){
				$('#unregistered').show();
			}
			else{
				$('#registered').show();
				console.log("true");
				initProject();
			}
		},
		error: function (err) {
			console.log('Error', err);
		}
	});
});

window.onresize = function(){
	fixVideoHeight();
}

function logout(){
	$.ajax({url: 'dispatcher.php?action=logout'});
	location.reload();
}

function login(){
	username = $('#inputUser').val();
	password = $('#inputPass').val();
	$.getJSON("dispatcher.php?action=login&user="+ username +"&password="+ password +"", function(response){
		if(response['credentials'] === true){
			location.reload();
		} else {
			console.log("login = false...");
		}
	});

}

function initEvents(){
	// ----==== MyButtons Events ====----
	document.getElementById('zoomIn').onclick = function(){ zoom(-0.3); };
	document.getElementById('zoomOut').onclick = function(){ zoom( 0.3); };
	$("#myRange").on("input", function(){speed(this.value)});

	// ----==== Video Events ====----
	$('#video').on('loadstart', function (event) {
	});
	$('#video').on('error', function (event) {
		console.log('error');
	});
	$('#video').on('canplay', function (event) {
	});
	$('#video').on('ended', function (event) {
		console.log('Video Ended')
		var tmpEvent = findNextEvent(timeline.getSelection());
		if(tmpEvent !== undefined && tmpEvent !== selectedEvent){
			timeline.setSelection(tmpEvent, {focus: true});
			selectedEvent = timeline.getSelection();
			selectEventPlay(selectedEvent);
		}
	});

	// ----==== Timeline Events ====----
	timeline.on('timechanged', function (properties) {
		if(properties.id === 'startEvents'){
			if (end - properties.time > 0){
				start = properties.time;
				loadCamData(start, end, groups);
			}
		} else if(properties.id === 'endEvents'){
			if (properties.time - start > 0){
				end = properties.time;
				loadCamData(start, end, groups);
			}
		}
		timeline.setCustomTime(start, 'startEvents');
		timeline.setCustomTime(end, 'endEvents');
	});
	timeline.on('select', function (properties) {
		if(properties.items.length === 0 || properties.event.type === 'press'){
			timeline.setSelection(selectedEvent);
			return 0;
		}
		$('#video-container').fadeIn()
		fixVideoHeight()
		selectedEvent = timeline.getSelection();
		console.log(properties);
		console.log(selectedEvent);
		selectEventPlay(selectedEvent);
	});
	$(document).on("mouseenter", '.vis-item', function ($e) {
		$(this).qtip({
			show: {ready: false}
		});
	});
}

function fixVideoHeight(){
	$('#video-container').height(
	parseInt($(window).height() -
	$('.Menu').outerHeight(true) -
	$('#visualization').outerHeight(true) -
	parseInt($("#visualization").css("margin-top")) -
	parseInt($("body").css("margin-top")) -
	parseInt($("body").css("margin-bottom"))
	));
}

function initProject(){
	$.ajax({url: 'dispatcher.php?action=deleteVideos'});
	groups = []
	$.getJSON("dispatcher.php?action=getCamPaths", function(response){
		for (var i = 0; i < response.length; i++) {
			console.log(i, response[i])
			groups.push({id: i, content: response[i]});
		}

		var container = document.getElementById('visualization');
		var options = {
			dataAttributes: 'all',
			stack: false
		};
		timeline = new vis.Timeline(container, [], groups, options);

		start = new Date();
		start.setDate(start.getDate() - 0.1);
		end = new Date();

		timeline.addCustomTime(start, 'startEvents');
		timeline.addCustomTime(end, 'endEvents');
		timeline.setWindow({
			start: start,
			end:   end
		});
		speed(1);
		loadCamData(start, end, groups);
		initEvents();
	})
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
	datestart = new Date(selectedDOM.attr('data-start'));
	dateend = new Date(selectedDOM.attr('data-end'));
	datediff = Math.round((dateend - datestart) / 1000 / 60 * 100) / 100
	camera = selectedDOM.attr('data-group');
	resolution = $("#resolution").val();
	console.log(datediff);
	console.log(resolution);
	continueRun = true
	if(datediff > 2 && resolution != 'null'){
		continueRun = confirm('This video is ' + datediff + ' minutes, this could have a negative affect on this Server. Continue running?')
	}
	if(continueRun){
		streamURL = "dispatcher.php?action=getVideo&camera="+camera+"&datadir="+datadir+"&file="+file+"&start="+videostart+"&end="+videoend+"&resolution="+resolution;
		var video = document.getElementById('video');
		var source = document.getElementById('source');
		source.setAttribute("src", streamURL);
		video.load();
		video.play();
	}

}

function loadCamData(start, end, groups){
	$('#loading').fadeIn()
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
			$('#loading').fadeOut()
		},
		error: function (err) {
			console.log('Error', err);
			$('#loading').fadeOut()
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
	videoID.defaultPlaybackRate = newSpeed;
	videoID.playbackRate = newSpeed;
	document.getElementById('speedNum').textContent =  Math.round(videoID.playbackRate * 100) / 100;
}

