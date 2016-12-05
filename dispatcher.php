<?php
	error_reporting(E_ALL);
	date_default_timezone_set('GMT');

	require_once 'libHikvision.php';

	$camPaths = array(
		"/home/bkbilly/tmpmount/info.bin",
		"/home/bkbilly/tmpmount/info.bin",
	);


	$action = $_REQUEST['action'];
	switch($action){
		case 'getVideo' : getVideo($camPaths); break;
		case 'getAllEvents' : getAllEvents($camPaths); break;
		default: echo "Not an Option"; break;
	}

	function getVideo($camPaths){
		$camera = $_REQUEST['camera'];
		$datadir = $_REQUEST['datadir'];
		$file = $_REQUEST['file'];
		$videoStart = $_REQUEST['start'];
		$videoEnd = $_REQUEST['end'];
		$resolution = $_REQUEST['resolution'];
		$cctv = new hikvisionCCTV( $camPaths[$camera] );
		$VideoFile = $cctv->extractSegmentMP4($datadir,$file,$videoStart,$videoEnd,'streamvideo',$resolution);
		error_log($VideoFile);
		$cctv->streamFileToBrowser($VideoFile);
	}

	function getAllEvents($camPaths){
		$dayBegin = $_REQUEST['start'];
		$dayEnd = $_REQUEST['end'];
		$cameras = json_decode($_REQUEST['cameras']);

		$allEvents = array();
		foreach ($cameras as $camera) {
			$cctv = new hikvisionCCTV( $camPaths[$camera] );

			$events = $cctv->getSegmentsBetweenDates($dayBegin, $dayEnd);
			foreach($events as $event){
				$datadir = $event['cust_dataDirNum'];
				$file = $event['cust_fileNum'];
				$videoStart = $event['startOffset'];
				$videoEnd = $event['endOffset'];
				$timeStart = $event['cust_startTime'];
				$timeEnd = $event['cust_endTime'];
				$allEvents[] = array(
					'start' => date("Y-m-j H:i:s",$timeStart),
					'end' => date("Y-m-j H:i:s",$timeEnd),
					'content' => "",
					'group' => intval($camera),
					'datadir' => $datadir,
					'file' => $file,
					'videoStart' => $videoStart,
					'videoEnd' => $videoEnd
				);
			}
		}
		echo json_encode($allEvents);
	}
?>