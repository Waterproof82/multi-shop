/^COPY "[^"]+"[.]/ { match($0, /^COPY "[^"]+"/); esquema = substr($0, 7, RLENGTH - 7); saltar = (esquema != "public") }
/^SELECT pg_catalog[.]setval[(]/ { if ($0 !~ /setval[(].["]public["][.]/) next }
saltar { if ($0 ~ /^\\[.]$/) saltar = 0; next }
{ print }
