"""Simple connectivity-check placeholder."""

from urllib.request import urlopen


def main():
    url = "https://www.google.com"
    try:
        with urlopen(url, timeout=5) as response:
            print(f"Connected to {url} (HTTP {response.status})")
    except Exception as exc:
        print(f"Could not reach {url}: {exc}")


if __name__ == "__main__":
    main()
