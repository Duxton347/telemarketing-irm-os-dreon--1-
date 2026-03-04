<?php
// proxy.php
// Permite requisições de qualquer origem (útil se o frontend estiver num subdomínio)
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

if (!isset($_GET['url'])) {
    http_response_code(400);
    echo json_encode(['error' => 'URL source not provided']);
    exit;
}

$url = $_GET['url'];

// Segurança: garantir que só a API do Google seja requisitada
if (strpos($url, 'https://maps.googleapis.com/') !== 0) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden URL. Only Google APIs allowed.']);
    exit;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
// Desativa verificação SSL estrita (opcional, útil em alguns servidores compartilhados)
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => curl_error($ch)]);
} else {
    echo $response;
}

curl_close($ch);
?>
