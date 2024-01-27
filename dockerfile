FROM php:8.0-apache

WORKDIR /var/www/html/

RUN apt-get update && \
  apt-get install -y git ffmpeg libmagickwand-dev --no-install-recommends && \
  pecl install imagick && \
  docker-php-ext-enable imagick && \
  git clone https://github.com/ccrlawrence/Hikvision-Site.git /var/www/html && \
  rm .htaccess && \
  chown -R www-data:www-data /var/www

