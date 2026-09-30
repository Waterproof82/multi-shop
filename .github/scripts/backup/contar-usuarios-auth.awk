/^COPY "auth"[.]"users"/ { d = 1; next }
d && /^\\[.]$/ { d = 0 }
d { n++ }
END { print n + 0 }
