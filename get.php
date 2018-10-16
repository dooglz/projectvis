<?php
header("Access-Control-Allow-Origin: *");
header('Content-Type: application/json');

function authKey() {
  static $key = null;
  if ($key === null) {
    try
    {
      $myFile = "authkey.txt";
      $fh = fopen($myFile, 'r');
      $key = fread($fh, 40);
      fclose($fh);
    } catch ( Exception $e ) {
      header("HTTP/1.0 500 Internal Server Error");
      die();
    } 
  }
  return $key;
}
function q_user($fuser) {
  return "{\"query\":\"{\\n repositoryOwner(login: \\\"".$fuser."\\\") {\\n id\\n url\\n avatarUrl\\n repositories(last:50, privacy:PUBLIC) {\\n edges {\\n node {\\n id\\n name\\n updatedAt\\n }\\n }\\n }\\n }\\n}\\n\",\"variables\":{},\"operationName\":null}";
}
function q_repo($fuser, $fname) {
  return "{\"query\":\"{\\n repository(owner: \\\"".$fuser."\\\", name: \\\"".$fname."\\\") {\\n name\\n labels(last:50) {\\n edges {\\n node {\\n name\\n id\\n color\\n }\\n }\\n }\\n projects(last: 2) {\\n edges {\\n node {\\n name\\n id\\n columns(last: 10) {\\n edges {\\n node {\\n name\\n id\\n cards(last:100) {\\n edges {\\n node {\\n id\\n note\\n }\\n }\\n }\\n }\\n }\\n }\\n }\\n }\\n }\\n milestones(last: 20) {\\n edges {\\n node {\\n dueOn\\n title\\n id\\n }\\n }\\n }\\n issues(last: 100) {\\n edges {\\n node {\\n id\\n title\\n closedAt\\n url\\n milestone {\\n id\\n }\\n number\\n projectCards(last: 50) {\\n edges {\\n node {\\n id\\n }\\n }\\n }\\n labels(first: 10) {\\n edges {\\n node {\\n id\\n }\\n }\\n }\\n }\\n }\\n }\\n }\\n}\\n\",\"variables\":{},\"operationName\":null}";
}

function makeCall($query){
  $curl = curl_init(); 
  curl_setopt_array($curl, array(
    CURLOPT_URL => "https://api.github.com/graphql",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => "",
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_POSTFIELDS => $query,
    CURLOPT_HTTPHEADER => array(
      "authorization: bearer ".authKey(),
      "cache-control: no-cache",
      "User-Agent: Dooglz-projectview"
    ),
  ));
  return $curl;
}
if (isset($_GET['repo']) && !isset($_GET['user'])) {
  echo "{error:\"supply a username\"}";
}else if (!isset($_GET['repo']) && isset($_GET['user'])) {
  echo "{error:\"supply a repo\"}";
}else if (isset($_GET['repo']) && isset($_GET['user'])) {
  $repo = filter_var($_GET['repo'], FILTER_SANITIZE_STRING);
  $user = filter_var($_GET['user'], FILTER_SANITIZE_STRING);
  if (!is_null($repo) && strlen($repo) > 0 && !is_null($user) && strlen($user) > 0) {
    if($user != "dooglz"){
      echo "{error:\"Repo Arg Error, Dooglz Only for now!\"}";
      return;
    }
    $curl     = makeCall(q_repo($user,$repo));
    $response = curl_exec($curl);
    $err      = curl_error($curl);
    curl_close($curl);
    if ($err) {
      echo "{error:cURL Error #:" . $err . "}";
    } else {
      echo $response;
    }
  } else {
    echo "{error:\"Repo Arg Error\"}";
  }
} else if (isset($_GET['userinfo'])) {
  $user = filter_var($_GET['userinfo'], FILTER_SANITIZE_STRING);
  if (!is_null($user) && strlen($user) > 0) {
    if($user != "dooglz"){
      echo "{error:\"userinfo Arg Error, Dooglz Only for now!\"}";
      return;
    }
    $curl     = makeCall(q_user($user));
    $response = curl_exec($curl);
    $err      = curl_error($curl);
    curl_close($curl);
    if ($err) {
      echo "{error:cURL Error #:" . $err . "}";
    } else {
      echo $response;
    }
  } else {
    echo "{error:\"userinfo Arg Error\"}";
  }
}