# PPTX templates

Template support is intentionally explicit. A usable template consists of:

```text
template.pptx
template.template.json
```

The sidecar declares a mapping for every slide layout used by a presentation:

```json
{
  "layouts": {
    "title": {
      "templateLayout": "Title Slide",
      "placeholders": {
        "title": { "x": 0.85, "y": 1.0, "w": 11.5, "h": 1.0 }
      }
    },
    "content": {
      "templateLayout": "Content",
      "placeholders": {
        "title": { "x": 0.85, "y": 0.55, "w": 11.5, "h": 0.45 },
        "body": { "x": 0.95, "y": 1.55, "w": 11.2, "h": 4.8 }
      }
    }
  }
}
```

The renderer validates that the PPTX exists and that every generated layout has a mapping before writing. An arbitrary PPTX without this sidecar is rejected; it is not silently treated as a JSON theme. JSON themes remain the portable fallback and control fonts, colors, margins, footer, and logo placement.
