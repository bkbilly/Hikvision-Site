FROM php:5.6-apache

WORKDIR /var/www/html/

RUN apt update
RUN apt install ffmpeg -y


RUN apt-get update && apt-get install -y \
    libmagickwand-dev --no-install-recommends \
    && pecl install imagick \
	&& docker-php-ext-enable imagick

RUN apt-get install -y git
RUN git clone https://github.com/bkbilly/Hikvision-Site.git /var/www/html
RUN rm .htaccess
RUN chown -R www-data:www-data /var/www

