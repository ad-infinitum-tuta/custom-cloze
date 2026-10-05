# CustomCloze

A mobile-friendly, fill-in-the-blank language practice app that runs entirely in the browser — no build tools, no framework, no installation required.

**Live app:** https://tzisf62c.github.io/custom-cloze/

---

## Features

- Practice cloze (fill-in-the-blank) exercises using your own word lists
- Filter practice by language and category; words are drawn from a local IndexedDB database
- Import words via CSV or enter them manually
- Session history and scoring stored locally — no server, no login
- Works offline after the first page load

## Supported Languages (sample data included)

Arabic, Chinese (Simplified & Traditional), English, French, Hindi, Korean, Spanish, Thai

## Usage

**To add your own words:**
1. Go to **Manage Words**
2. Enter words manually, including their language, or import a CSV with headers: `word`, `category`, `sentences`, `language`
3. Separate multiple sentences in the `sentences` column with `|`.
4. On the Practice page, choose a language or **All languages**, then choose a category.


### Running a Local Live Server

From the directory containing the project, run:

```bash
cd customcloze && perl -MIO::Socket::INET -e '$server = IO::Socket::INET->new(LocalPort => 8000, Listen => 5, Reuse => 1) or die "Cannot bind port 8000: $!\n"; while ($client = $server->accept()) { $client->autoflush(1); my $request = <$client> // ""; my ($path) = $request =~ /^\S+\s+(\S+)/; $path = "/index.html" unless defined $path && length $path; $path =~ s/\?.*//; $path =~ s/\.\.//g; my $file = "." . $path; $file = "./index.html" if -d $file; if (open my $fh, "<", $file) { binmode $fh; local $/; my $body = <$fh>; my %types = (".html" => "text/html", ".js" => "text/javascript", ".css" => "text/css", ".csv" => "text/csv"); my ($ext) = $file =~ /(\.[^.]+)$/; my $type = $types{$ext} || "application/octet-stream"; print $client "HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: " . length($body) . "\r\nConnection: close\r\n\r\n$body"; close $fh; } else { print $client "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"; } close $client; }'
```

Then open the app in your browser at:

`http://localhost:8000`

To stop the server, press `Ctrl+C` in the terminal.

## Project Structure

```
customcloze/
├── index.html    # App shell — all screen markup
├── style.css     # Mobile-first styles
├── app.js        # Entry point; handles screen switching
├── db.js         # IndexedDB access via Dexie.js
├── engine.js     # Word selection and sentence masking
├── activity.js   # Practice screen logic
├── manage.js     # Manage screen logic
└── samples/      # Sample CSV word lists
```

## Dependencies

Loaded from CDN — no installation needed:

- [Dexie.js](https://dexie.org/) — IndexedDB wrapper
- [PapaParse](https://www.papaparse.com/) — CSV parsing

## Deployment

This repo deploys automatically to GitHub Pages via GitHub Actions on every push to `main`. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## License

See [LICENSE](LICENSE).
