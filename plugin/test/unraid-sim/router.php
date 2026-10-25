<?php
// Router for PHP's built-in server, as Unraid's nginx routes: pages (a path starting with a
// capital letter) through webGui/template.php, PHP files run, the rest served as files. The
// fake libvirt (libvirt_stub.php) stands in for the PHP extension.
require_once __DIR__ . '/libvirt_stub.php';
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = '/usr/local/emhttp' . $uri;
if ($uri !== '/' && is_file($file)) {
  if (substr($file, -4) !== '.php') return false;
  $_SERVER['SCRIPT_NAME'] = $uri; $_SERVER['SCRIPT_FILENAME'] = $file; $_SERVER['DOCUMENT_ROOT'] = '/usr/local/emhttp';
  $docroot = '/usr/local/emhttp';
  require $file;
  return true;
}
if (preg_match('#^/[A-Z]#', $uri)) {
  $_SERVER['SCRIPT_NAME'] = '/webGui/template.php'; $_SERVER['DOCUMENT_ROOT'] = '/usr/local/emhttp';
  require '/usr/local/emhttp/webGui/template.php';
  return true;
}
http_response_code(404);
return true;
