# README #

This Web Application is a nice UI for all your hikvision cameras. It supports Login and it is using native HTML5 without the need to install any other plugin for the client.

### Dependencies ###

It needs PHP version 5.6 or newer for the unpack to support 64 bit format

### How to configure ###

*dispatcher.php:*

* At the **DEFINE USERNAME** & **DEFINE PASSWORD** change it into your own desire.
* At the **$camPaths** add an array of all your cameras **info.bin** files.

*myjs.js:*

* At **initProject()** where the variable groups is initialized, replace it with the **id** & **content** of each of your camera.

### Credits ###

Used the libHikvision library by Dave Hope, available at https://github.com/davehope/libHikvision