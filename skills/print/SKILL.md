---
name: print
description: Print files, PDFs, or text to the Brother MFC-L8390CDW printer. Use when the user asks to print something, send something to the printer, or make a hard copy of a file or document.
---

# Print Skill

Printer: Brother MFC-L8390CDW series
Queue: `Brother_MFC_L8390CDW_series` (default printer, AirPrint, color laser)

## Basic usage

```bash
lp -d Brother_MFC_L8390CDW_series <file>
```

## Common options

| Option | Flag |
|---|---|
| Copies | `-n 2` |
| 2-sided (long edge) | `-o Duplex=DuplexNoTumble` |
| 2-sided (short edge) | `-o Duplex=DuplexTumble` |
| Color | `-o ColorModel=RGB` |
| B&W | `-o ColorModel=Gray` |
| Paper size | `-o PageSize=A4` (default) |
| Paper tray | `-o InputSlot=tray-1` or `by-pass-tray` |

## Examples

Print a PDF, duplex, A4:
```bash
lp -d Brother_MFC_L8390CDW_series -o PageSize=A4 -o Duplex=DuplexNoTumble file.pdf
```

Print plain text:
```bash
echo "Hello" | lp -d Brother_MFC_L8390CDW_series
```

Check printer status:
```bash
lpstat -p Brother_MFC_L8390CDW_series
```

Cancel all jobs:
```bash
cancel -a Brother_MFC_L8390CDW_series
```
