import sanitizeHtml from "sanitize-html";

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "h1",
  "h2",
  "h3",
  "img",
  "u",
];

const allowedImageSizes = new Set(["small", "medium", "large", "full"]);
const allowedImageAlignments = new Set(["left", "center", "right"]);

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "";
}

function normalizeImageSize(value) {
  return allowedImageSizes.has(value) ? value : "full";
}

function normalizeImageAlign(value) {
  return allowedImageAlignments.has(value) ? value : "center";
}

export function sanitizeNewsHtml(value) {
  return sanitizeHtml(String(value || "").replace(/\u00a0/g, " "), {
    allowedTags,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      ol: ["start"],
      li: ["value", "data-value"],
      img: ["src", "alt", "title", "data-size", "data-align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noreferrer noopener",
        target: "_blank",
      }),
      ol(tagName, attribs) {
        const start = normalizePositiveInteger(attribs.start);
        return { tagName, attribs: start && start !== "1" ? { ...attribs, start } : {} };
      },
      li(tagName, attribs) {
        const value = normalizePositiveInteger(attribs.value || attribs["data-value"]);
        return { tagName, attribs: value ? { value, "data-value": value } : {} };
      },
      img(tagName, attribs) {
        const size = normalizeImageSize(attribs["data-size"]);
        const align = normalizeImageAlign(attribs["data-align"]);
        const nextAttribs = { ...attribs };

        if (size === "full") {
          delete nextAttribs["data-size"];
        } else {
          nextAttribs["data-size"] = size;
        }

        if (align === "center") {
          delete nextAttribs["data-align"];
        } else {
          nextAttribs["data-align"] = align;
        }

        return { tagName, attribs: nextAttribs };
      },
    },
  });
}

export function getTextFromNewsHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}
