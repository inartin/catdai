import sanitizeHtml from "sanitize-html";

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "h1",
  "h2",
  "h3",
  "img",
  "u",
];

export function sanitizeNewsHtml(value) {
  return sanitizeHtml(String(value || "").replace(/\u00a0/g, " "), {
    allowedTags,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
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
