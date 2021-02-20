<?php
/*
 * Hikvision CCTV Class, version 1.2
 * This class will parse a Hikvision index file (e.g. index00.bin) tha
 * typically gets stored on external media such as an SD card or NFS share.
 *
 * Access to avconv and shell() is required for the creation of thumbnails.
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
					'C2infoEndTime/'.
					'C2existByte/'.
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
				$tmp['fileExists'] = False;
				if ($tmp['existByte1'] >= 160 && $tmp['existByte2'] >= 94) {
					$tmp['fileExists'] = True;
				}
		
				// Ignore empty and those which are still recording.	
				if($tmp['type'] != 0 && $tmp['endTime'] != 0) //&& $tmp['fileExists'] == True)
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
	/// extractSegmentMP4( Index File, File Number , Start Offset, End Offset, 
	/// Cache Location )
	/// Extracts a recording segment (likely x264) and copies the raw video
	/// stream into an MP4 container that's more useful.
	///
	public function extractSegmentMP4( $_dataDirNum, $_file , $_startOffset, $_endOffset , $_cachePath , $_resolution )
	{
		$file = $this->getFileName($_file);
		$path = $this->pathJoin(
			$this->configuration[$_dataDirNum]['path'],
			$file
		);
		$tempFileName = $_dataDirNum.'.'. $_file.'.'. $_startOffset.'.'. $_endOffset.'.'. $_resolution;
		$pathExtracted = $this->pathJoin( $_cachePath, $tempFileName.'.h264');
		$pathTranscoded = $this->pathJoin( $_cachePath, $tempFileName.'.mp4');
		
		// If file already exists, return path to it.
		if( file_exists( $pathTranscoded ))
			return $pathTranscoded;
		
		// Extract raw h264 footage and store in temp file. Avoiding 
		// pipes to improve performance. Testing showed just piping dd to
		// ffmpeg was _really_ slow.
		$fh = fopen( $path, 'rb');
		if($fh == false)
			die("Unable to open $path");
		
		if( fseek($fh, $_startOffset) === false )
			die("Unable to seek to position $_startOffset in $path");
		
		while(ftell($fh) < $_endOffset)
		{
			file_put_contents($pathExtracted, fread($fh, 4096), FILE_APPEND);
		}
		fclose($fh);
		
		// Extract footage and pass to avconv. 
		if( $_resolution != null and $_resolution != "null" )
			$cmd = 'ffmpeg -i '.$pathExtracted.' -threads auto -s '.$_resolution.' -c:a none '.$pathTranscoded;
		else
			$cmd = 'ffmpeg -i '.$pathExtracted.' -threads auto -c:v copy -c:a none '.$pathTranscoded;
		system($cmd);
		
		// Transcode complete. Remove original file.
		unlink($pathExtracted);
		
		return $pathTranscoded;
	}
	
	
	///
	/// streamFileToBrowser (Path to file)
	/// Uses HTTP Range to stream a file to a browser. Neeed in Chrome and 
	/// other browsers to cleanly stream a file.
	/// Based on code from:
	/// http://www.media-division.com/php-download-script-with-resume-option/
	/// 
	function streamFileToBrowser( $_file )
	{
		/**
		* Copyright 2012 Armand Niculescu - media-division.com
		* Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
		* 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
		* 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
		* THIS SOFTWARE IS PROVIDED BY THE FREEBSD PROJECT "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE FREEBSD PROJECT OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
		*/
		#ob_clean();
		
		$fh = @fopen($_file, 'rb');
		$file_size = filesize( $_file );
		#header('Content-Type: video/mp4');
		
		// Check if this is a HTTP Range request.
		$range = '';
		if(isset($_SERVER['HTTP_RANGE']))
		{
			list($size_unit, $range_orig) = explode('=', $_SERVER['HTTP_RANGE'], 2);
			if(!$size_unit == 'bytes')
			{
				header('HTTP/1.1 416 Requested Range Not Satisfiable');
				exit;
			}
			
			// Multiple ranges could be specified.
			list($range, $extra_ranges) = array_pad( explode(',',$range_orig,2),2,null);
		}
		
		// Figure out download chunk from range (if set).
		list($seek_start, $seek_end) = array_pad(explode('-', $range,2),2,null);
		
		// Set start and end based on range (if set).
		// Also check for invalid ranges.
		$seek_end = (empty($seek_end)) ? ($file_size - 1) : min(abs(intval($seek_end)),($file_size - 1));
		$seek_start = (empty($seek_start) || $seek_end < abs(intval($seek_start))) ? 0 : max(abs(intval($seek_start)),0);
		
		// IE Workaround:
		// Only send partial content header if downloading a piece of a file
		if( $seek_start > 0 || $seek_end < ($file_size -1))
		{
			header('HTTP/1.1 206 Partial Content');
			header('Content-Range: bytes '.$seek_start.'-'.$seek_end.'/'.$file_size);
			header('Content-Length: '.($seek_end - $seek_start + 1));
		}
		else
		{
			#header('Content-Length: '.$file_size);
		}
		
		#header('Accept-Ranges: bytes');
		set_time_limit(0);
		fseek($fh, $seek_start);
                ob_implicit_flush(true);
		while(!feof($fh))
		{
			print(@fread($fh, 4096));
			if (connection_status()!=0)
			{
				@fclose($fh);
				exit;
			}
		}
		@flose($fh);
                ob_end_flush();
		exit;

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
