$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
$html = (curl.exe -s --compressed -A $UA -H 'Accept-Language: en-US,en;q=0.9' 'https://dokkaninfo.com/cards').Content
$m = $html | Select-String -Pattern 'v-bind:cardsjson=([\'"])(.*?)\1'
if ($m) {
    $jsonStr = $m.Matches[0].Groups[2].Value
    $jsonStr = $jsonStr -replace '"', '"' -replace '&#039;', "'" -replace '&apos;', "'" -replace '&nbsp;', ' ' -replace '&', '&' -replace '<', '<' -replace '>', '>'
    $cards = $jsonStr | ConvertFrom-Json
    $hercules = $cards | Where-Object { $_.name -like "*Hercule*" -or $_.character_name -like "*Hercule*" }
    $hercules | ForEach-Object {
        $_ | Select-Object id, character_id, name, character_name, rarity, type, element, awoken_max | Format-List
    }
}