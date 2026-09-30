/^COPY "[^"]+"[.]"[^"]+"/ { match($0, /^COPY "[^"]+"[.]"[^"]+"/); t = substr($0, 6, RLENGTH - 5); dentro = (t !~ /^"public"/); n = 0; next }
dentro && /^\\[.]$/ { if (n > 0) printf "| %s | %d |\n", t, n; dentro = 0; next }
dentro { n++ }
