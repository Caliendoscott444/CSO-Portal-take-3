$path = "src\components\portal\LeaveOfAbsence.tsx"
$content = Get-Content $path -Raw

$old = @'
    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setStartDate('');
'@

$new = @'
    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-loa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            discordUsername: profile.discord_username ?? '',
            startDate,
            endDate,
            reason,
            orgAbbr: 'CSO',
          }),
        }
      );
    } catch {
      // silent - Discord notification is best-effort
    }
    setStartDate('');
'@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "ANCHOR NOT FOUND - aborting, file unchanged" -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "Patch applied successfully" -ForegroundColor Green
}