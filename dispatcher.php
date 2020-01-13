<?php
	error_reporting(E_ALL);
	date_default_timezone_set('GMT');

	require_once 'libHikvision.php';

	define("USERNAME", $_SERVER["AuthUser"]);
	define("PASSWORD", $_SERVER["AuthPass"]);
	define("TMPVIDEOFILES", "streamvideo");
	$camPaths = explode(',', $_SERVER['camPaths']);
	$camNames = explode(',', $_SERVER['camNames']);


	$action = $_REQUEST['action'];
	switch($action){
		case 'getVideo' : getVideo($camPaths); break;
		case 'getCamPaths' : getCamPaths($camPaths, $camNames); break;
		case 'getAllEvents' : getAllEvents($camPaths); break;
		case 'deleteVideos' : deleteVideos(); break;
		case 'login' : login(); break;
		case 'logout' : logout(); break;
		case 'usrStatus' : usrStatus(); break;
		default: echo "Not an Option"; break;
	}

	function login(){
		session_start();
		$user = $_REQUEST['user'];
		$pass = $_REQUEST['password'];
		if($user == USERNAME and $pass == PASSWORD){
			$_SESSION['UserName']=$user;
			$status = array('credentials' => true);
		}
		else{
			$status = array('credentials' => false);
		}
		if(isset($_REQUEST['redirect']))
		{
			header("Location: ". $_REQUEST['redirect']);
		}

		echo json_encode($status);
	}

	function logout(){
		session_start();
		unset($_SESSION['UserName']);
		session_destroy();
		$status = array('logout' => true);
		echo json_encode($status);
	}

	function usrStatus(){
		session_start();
		if(isset($_SESSION['UserName'])){
			if($_SESSION['UserName'] == USERNAME){
				$status = array('connected' => true);
			}
			else{
				$status = array('connected' => false);
			}
		}
		else{
			$status = array('connected' => false);
		}
		echo json_encode($status);
	}

	function getCamPaths($camPaths, $camNames){
		session_start();
		if(isset($_SESSION['UserName'])){
			echo json_encode($camNames);
		}
	}

	function getVideo($camPaths){
		session_start();
		if(isset($_SESSION['UserName'])){
			$camera = $_REQUEST['camera'];
			$datadir = $_REQUEST['datadir'];
			$file = $_REQUEST['file'];
			$videoStart = $_REQUEST['start'];
			$videoEnd = $_REQUEST['end'];
			$resolution = $_REQUEST['resolution'];
			if (!file_exists(TMPVIDEOFILES)) {
				mkdir(TMPVIDEOFILES, 0777);
			}
			$cctv = new hikvisionCCTV( $camPaths[$camera] );
			$VideoFile = $cctv->extractSegmentMP4($datadir,$file,$videoStart,$videoEnd,TMPVIDEOFILES,$resolution);
			$cctv->streamFileToBrowser($VideoFile);
		}
	}

	function deleteVideos(){
		foreach (glob(TMPVIDEOFILES."/*") as $filename) {
			if (is_file($filename)) {
				unlink($filename);
			}
		}
	}

	function getAllEvents($camPaths){
		session_start();
		if(isset($_SESSION['UserName'])){
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
						'start' => date("Y-m-d H:i:s",$timeStart),
						'end' => date("Y-m-d H:i:s",$timeEnd),
						'content' => "",
						'group' => intval($camera),
						'datadir' => $datadir,
						'file' => $file,
						'videoStart' => $videoStart,
						'videoEnd' => $videoEnd
					);
				}
			}
		}
		echo json_encode($allEvents);
	}
?>
