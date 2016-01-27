<?php
/*
 * Hikvision CCTV Class, version 1.1
 * This class will parse a Hikvision index file (e.g. index00.bin) tha
 * typically gets stored on external media such as an SD card or NFS share.
 *
 * Access to ffmpeg and shell() is required for the creation of thumbnails.
 *
 * Thanks go to Alexey Ozerov for his C++ hiktools utility:
 *    https://github.com/aloz77/hiktools
 *
 * 
 */ 
error_reporting(E_ALL | E_STRICT);
ini_set('display_errors', 1);

define("HEADER_LEN", 1280);	// Length of the header struct in bytes.
define("FILE_LEN", 32);		// Length of the file struct in bytes.
define("SEGMENT_LEN", 80);	// Length of the segment struct in bytes.
define("NASINFO_LEN", 68);	// Length of info.bin used on NAS storage.

class hikvisionCCTV
{
	private $configuration;

	///
	/// __construct( Array of paths to datadir's' )
	/// Created a new instance of this class. The path MUST end in a '/'.
	///
	public function __construct( $_paths )
	{
		$paths = $_paths;
		
		// Create a configuration array for each datadir we are going to work
		// with.
		$this->configuration = array();
		
		// If a single path is provided check to see if it' an NAS info file.
		if(!is_array($_paths) && pathinfo($_paths, PATHINFO_BASENAME) == "info.bin")
		{
			// Parse info.bin and populate our configuration array with the 
			// details. 
			$dataDirCount = $this->getNASInfo($_paths)['DataDirs'];
			$pathRoot = pathinfo($_paths, PATHINFO_DIRNAME );
			$paths = array();
			
			// Add list of datadir's to local paths array for iteration.
			for($i=0; $i<$dataDirCount;$i++)
			{
				$paths[] = $this->pathJoin($pathRoot, 'datadir'.$i);
			}
		}
		
		// Individual paths have been provided, add them to our configutation
		// array.
		foreach($paths as $path)
		{
			$tmp = array(
				'path' => $path,
				'indexFile' => $this->pathJoin($path ,'index00.bin')
				);
			$this->configuration[] = $tmp;
		}
	}
	
	
	///
	/// getNASInfo( Path to NAS info.bin )
	///
	public function getNASInfo( $_infoFile )
	{
		$fh = fopen($_infoFile, 'rb');
	
		// Read length of file header.
		$data = fread($fh, NASINFO_LEN);
		$tmp = unpack(
			'a48serialNumber/'. // SERIALNO_LEN
			'H12MACAddr/'.		// MACADDR_LEN
			'C2byRes/'.
			'If_bsize/'.		// create_info_file (f_bsize)
			'If_blocks/'.		// create_info_file (f_blocks)
			'IDataDirs', $data);
		fclose($fh);
		return $tmp;
	}
	
	
	///
	/// getDataDirNum( Path to Index File )
	/// Return the index to the specified index File in our configuration array
	///
	private function getDataDirNum( $_index )
	{
		$pos = 0;
		foreach($this->configuration as $dataDir)
		{
			if( $dataDir['indexFile'] == $_index )
				return $pos;

			$pos++;
		}
	}


	///
	/// getFileHeaderForIndexFile( Path to Index File )
	/// Return array containing the file header from Hikvision "index00.bin".
	/// Based on the work of Alex Ozerov. (https://github.com/aloz77/hiktools/)
	///
	private function getFileHeaderForIndexFile( $_indexFile )
	{
		$fh = fopen($_indexFile, 'rb');

		// Read length of file header.
		$data = fread($fh, HEADER_LEN);
		$tmp = unpack(
			'Q1modifyTimes/'.
			'I1version/'.
			'I1avFiles/'.
			'I1nextFileRecNo/'.
			'I1lastFileRecNo/'.
			'C1176curFileRec/'.
			'C76unknown/'.
			'I1checksum', $data);
		fclose($fh);
		return $tmp;
	}


	///
	/// getFilesForIndexFile( Path to Index File )
	/// Return list of files. One video file may contain multiple segments,
	/// i.e. multiple events - motion detection, etc.
	/// Currently unused as it's more useful to return segments. 
	/// Based on the work of Alex Ozerov. (https://github.com/aloz77/hiktools/)
	///
	private function getFilesForIndexFile( $_indexFile )
	{
		$results = array();
		$header = $this->getFileHeaderForIndexFile($_indexFile);
		$fh = fopen($_indexFile, 'rb');

		// Seek to end of header.
		fread($fh, HEADER_LEN);

		// Iterate over recordings.
		for($i=0; $i<$header['avFiles']; $i++)
		{
			// Read length of recoridng header.
			$data = fread($fh, FILE_LEN);
			if( $data === false )
				break;	
	
			// Unpack data from the file based on C data types.
			$tmp = unpack(
				'I1fileNo/'.
				'S1chan/'.
				'S1segRecNums/'.
				'I1startTime/'. // time_t. Hikvision is x86 and uses a 4 Byte long.
				'I1endTime/'. // time_t - Hikvision is x86 and uses a 5 Byte long.
				'C1status/'. 
				'C1unknownA/'.
				'S1lockedSegNum/'.
				'C4unknownB/'.
				'C8infoTypes/'
				,$data);

			if( $tmp['chan'] != 65535 )
				array_push($results, $tmp);
		}
		fclose($fh);
		return $results;
	}

	
	///
	/// getSegments()
	/// Returns an array of files and segments fror Hikvision data directories
	/// by calling getSegmentsForIndexFile().
	///
	public function getSegments()
	{
		$results = array();
		// Iterate over all datadir's
		foreach($this->configuration as $dataDir)
		{
			// Get the segments for the index file of this datadir.
			$segments = $this->getSegmentsForIndexFile($dataDir['indexFile']);
			
			// Iterate over this datadir's segments and append the segment to
			// the results array.
			foreach($segments as $segment)
			{
				$results[] = $segment;
			}
		}
		return $results;
	}


	///
	/// getSegmentsForIndexFile( Path to Index File )
	/// Returns an array of files and segments from a Hikvision "index00.bin"
	/// file.
	/// Based on the work of Alex Ozerov. (https://github.com/aloz77/hiktools/)
	///
	private function getSegmentsForIndexFile( $_indexFile )
	{
		// Maximum number of segments possible per recording.
		$maxSegments = 256;	

		$results = array();
		$fh = fopen($_indexFile, 'rb');

		// Seek to the end of the header and recordings.
		$header = $this->getFileHeaderForIndexFile($_indexFile);
		$offset = HEADER_LEN + ($header['avFiles'] * FILE_LEN);
		fread($fh, $offset);

		// Iterate over the number of recordings we have.
		for($i=0;$i<$header['avFiles'];$i++)
		{
			for ($j=0;$j<$maxSegments;$j++)
			{
				// Read length of the segment header.
				$data = fread($fh, SEGMENT_LEN);
				if($data === false)
					break;

				$tmp = unpack(
					'C1type/'.
					'C1status/'.
					'C2resA/'.
					'C4resolution/'.
					'P1startTime/'. // unit64_t
					'P1endTime/'. // uint64_t
					'P1firstKeyFrame_absTime/'. // unit64_t
					'I1firstKeyFrame_stdTime/'.
					'I1lastFrame_stdTime/'.
					'IstartOffset/'.
					'IendOffset/'.
					'C4resB/'.
					'C4infoNum/'.
					'C8infoTypes/'.
					'C4infoStartTime/'.
					'C4infoEndTime/'.
					'C4infoStartOffset/'.
					'C4infoEndOffset'
					,$data);
				
				$startTime = $this->convertTimestampTo32($tmp['startTime']);
				$endTime = $this->convertTimestampTo32($tmp['endTime']);
				$tmp['cust_startTime'] = $startTime;
				$tmp['cust_endTime'] = $endTime;
				$tmp['cust_fileNum'] = $i;
				$tmp['cust_dataDirNum'] = $this->getDataDirNum($_indexFile);
				$tmp['cust_indexFile'] = $_indexFile;
		
				// Ignore empty and those which are still recording.	
				if($tmp['type'] != 0 && $tmp['endTime'] != 0)
					array_push($results, $tmp);
			}
		}
		fclose($fh);
		return $results;
	}
	
	
	///
	/// getSegmentsBetweenDates( Start Date , End Date)
	/// Returns an array of segments between the specified dates.
	///
	public function getSegmentsBetweenDates($_start , $_end)
	{
		$results = array();
		$segments = $this->getSegments();

		// Iterate over segments associated with this recording.
		foreach($segments as $segment)
		{
			// Check if the segment began recording in the specified window
			if( $_start < $segment['cust_startTime'] && $_end > $segment['cust_endTime'] )
				array_push($results, $segment);
		}
		return $results;
	}
	
	
	///
	/// getSegmentsByDate( Start Date , End Date)
	/// Returns an array of segments between the speficied dates, indexed by 
	/// day (unix timestamp)
	///
	public function getSegmentsByDate($_start, $_end)
	{
		$segments = $this->getSegmentsBetweenDates($_start, $_end);

		// Iterate over the list of segments and index them by day.
		$segmentsByDay = array();
		foreach($segments as $segment)
		{
			$startTime = $segment['cust_startTime'];
			$index = strtotime("midnight", $startTime);
			
			// This day doesn't exist, add it to our list.
			if(!isset( $segmentsByDay[$index] ))
			{
				$segmentsByDay[$index] = array(
					'start' => $index,
					'end' => strtotime("tomorrow", $startTime) - 1,
					'segments' => array()
					);
			}
			// Add segment to day.
			$segmentsByDay[$index]['segments'][] = $segment;
		}
		
		return $segmentsByDay;
	}
	
	
	///
	/// timeFilename( Prefix, Suffix, Start Time, End Time)
	/// Generates a file name based on the speificed values. Used to generate an
	// output file name for video clips.
	///
	public function timeFilename($_prefix, $_suffix, $_startTime, $_endTime)
	{
		$startTime = strftime("%Y-%m-%d_%H.%M.%S",$_startTime);
		$endTime = strftime("%H.%M.%S", $_endTime);

		return $_prefix."_".$startTime."_to_".$endTime.$_suffix;
	}
	
	
	//
	// convertTimestampTo32( 64bit timestamp )
	// Converts an unsigned long long (uint_64) to an unsigned long. Useful
	// since PHP's 64bit timestamp support is useless.
	// 
	public function convertTimestampTo32( $_in )
	{
		$mask = 0x00000000ffffffff; 
		return $_in & $mask;
	}
	
	
	///
	/// getSegmentClipHTTP( Index File, File Number , Start Offset, End Offset )
	/// Extracts a recording segment from the specified file, chunking the
	/// request to 4kb at a time to conserve memory.
	///
	public function getSegmentClipHTTP( $_dataDirNum, $_file , $_startOffset, $_endOffset )
	{
		$file = $this->getFileName($_file);
		$path = $this->pathJoin(
			$this->configuration[$_dataDirNum]['path'],
			$file
		);
		
		$fh = fopen( $path, 'rb');
		if($fh == false)
			die("Unable to open $path");
		
		if( fseek($fh, $_startOffset) === false )
			die("Unable to seek to position $_startOffset in $path");
		
		header('Content-Disposition: attachment; filename="'.$file.'"');
		
		if (ob_get_level() == 0)
			ob_start();
		
		while(ftell($fh) < $_endOffset)
		{
			print fread($fh, 4096);
		}
		ob_end_flush();
		fclose($fh);
	}
	
	
	///
	/// getSegmentClipHTTPstream( Index File, File Number , Start Offset, End Offset )
	///
	public function getSegmentClipHTTPstream( $_dataDirNum, $_file , $_startOffset, $_endOffset )
	{
		$filename = $this->getFileName($_file);
		$pathOriginal = $this->pathJoin(
			$this->configuration[$_dataDirNum]['path'],
			$filename
		);
		$pathCropped = "streamvideo/crop_$filename";
		$pathStreamed = "streamvideo/str_$filename";
		
		$file = fopen($pathOriginal, 'rb');
		$cur=$_startOffset;
		fseek($file,$_startOffset,0);
		while(!feof($file) && $cur<$_endOffset){
			file_put_contents($pathCropped, fread($file,min(1024*16,$_endOffset-$cur)), FILE_APPEND);
			$cur+=1024*16;
		}
		fclose($file);

		$cmd = "ffmpeg -i $pathCropped -y -vcodec libx264 -vf scale=-2:480 -preset veryfast -pix_fmt yuv420p $pathStreamed";
		passthru($cmd);
		unlink($pathCropped);

		$file2 = fopen($pathStreamed, 'rb');
		$size = filesize($pathStreamed);
		$cur=0;
		$start=0;
		$end=$size-1;
		header("Content-Type: video/mp4");
		header("Content-Length: ".$size);

		fseek($file2, $start);
		// $buffer = 512;
		// while(!feof($file2) && ($p = ftell($file2)) <= $end) {
		// 	if ($p + $buffer > $end) {
		// 		$buffer = $end - $p + 1;
		// 	}
		// 	set_time_limit(0);
		// 	echo fread($file2, $buffer);
		// 	flush();
		// }
		echo fread($file2, $size);
		fclose($file2);
		unlink($pathStreamed);
	}

	
	///
	/// getFileName( File Number )
	/// Returns the full path to the specified recording file.
	///
	public function getFileName( $_file )
	{
		$file = sprintf('hiv%05u.mp4', $_file);
		return $file;
	}
	
	
	///
	/// extractThumbnail(Data directory #, File Number, offset, Path to output file)
	/// Extracts a thumbnail from a recording file based on the offset provided
	///
	public function extractThumbnail($_dataDirNum, $_file, $_offset, $_output)
	{
		$path = $this->pathJoin(
			$this->configuration[$_dataDirNum]['path'],
			$this->getFileName($_file)
		);
		
		if(!file_exists($_output))
		{
			$cmd = 'dd if='.$path.' skip='.$_offset.' ibs=1 | ffmpeg -i pipe:0 -vframes 1 -an '.$_output.' >/dev/null 2>&1';
			system($cmd);
		}
	}
	
	
	///
	/// pathJoin (paths)
	/// Joins two or more strings together to produce a valid file path.
	///
	private function pathJoin()
	{
		return preg_replace('~[/\\\]+~', DIRECTORY_SEPARATOR, implode(DIRECTORY_SEPARATOR, func_get_args()));
	}
	
}
?>