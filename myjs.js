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
	document.getElementById('prevEvent').onclick = function(){ gotoEvent('previous'); };
	document.getElementById('nextEvent').onclick = function(){ gotoEvent('next'); };
	document.getElementById('toggleVis').onclick = function(){ $('#visualization').toggle('slow', function() {fixVideoHeight();}); };
	document.getElementById('liveview').onclick = function(){ $('#liveview').attr('src', $('#liveview').attr('src')); };
	(function(){
		$('#liveview').attr('src', $('#liveview').attr('src')).load(function(){
			console.log('loaded');
			fixVideoHeight();
		});
		setTimeout(arguments.callee, 4000);
	})();

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
		gotoEvent('next');
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
		$('#video').show()
		$('#liveview').hide()
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

function hideTimeline(){
	$('#visualization').toggle('slow', function() {
		fixVideoHeight();
	});
}

function fixVideoHeight(){
	var visualization_height = 0;
	var menu_height = 0;
	if ($('#visualization').is(":visible"))
		visualization_height = parseInt(
			$('#visualization').outerHeight(true) +
			parseInt($("#visualization").css("margin-top"))
		);
	if ($('.Menu').is(":visible"))
		menu_height = parseInt($('.Menu').outerHeight(true))

	$('#video-container').height(parseInt(
		$(window).height() -
		menu_height -
		visualization_height -
		parseInt($("body").css("margin-top")) -
		parseInt($("body").css("margin-bottom"))
	));
}

function initProject(){
	$.ajax({url: 'dispatcher.php?action=deleteVideos'});
	groups = []
	$.getJSON("dispatcher.php?action=getCamPaths", function(response){
		for (var i = 0; i < response.length; i++) {
			content = '<a href="#" onclick="showLivestream('+i+');">' + response[i] + '</a>'
			//content = response[i]
			console.log(i, response[i])
			groups.push({id: i, content: content});
		}

		var container = document.getElementById('visualization');
		var options = {
			dataAttributes: 'all',
			stack: false,
			onInitialDrawComplete: function() { fixVideoHeight(); },
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

function gotoEvent(position){
	var tmpEvent = findEvent(timeline.getSelection(), position);
	console.log(tmpEvent);
	if(tmpEvent !== undefined && tmpEvent !== selectedEvent){
		timeline.setSelection(tmpEvent, {focus: false});
		selectedEvent = timeline.getSelection();
		selectEventPlay(selectedEvent);
	}
}

function findEvent(dataID, position){
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
			if (position === 'next') {
				if(timeEventStart < tmpEventStart){
					maxEvents.push(tmpEvent);
				}
			}
			if (position === 'previous'){
				if(timeEventStart > tmpEventStart){
					maxEvents.push(tmpEvent);
				}
			}
		}
	};
	console.log(maxEvents);
	if(maxEvents.length === 0)
		return undefined;

	var timeEventSelect = [maxEvents[0].id];
	timeEventStart = new Date(maxEvents[0].start);
	for (var i = 0; i < maxEvents.length; i++) {
		var tmpEvent = maxEvents[i];
		var tmpEventStart = new Date(tmpEvent.start);
		if (position === 'next') {
			if(tmpEventStart < timeEventStart){
				timeEventSelect = [tmpEvent.id];
			} else {
				timeEventStart = tmpEventStart;
			}
		} else if (position === 'previous'){
			if(tmpEventStart > timeEventStart){
				timeEventSelect = [tmpEvent.id];
			} else {
				timeEventStart = tmpEventStart;
			}
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

function showLivestream(index){
	$('#video').hide()
	$('#liveview').show()
	$('#video-container').fadeIn()

	url = 'dispatcher.php?action=videopicture&index=' + index
	console.log(url)
	if ($('#liveview').is(":visible")) {
		$('#liveview').attr('src', url).load(function(){
			console.log('loaded');
			fixVideoHeight();
		});
	}
}

