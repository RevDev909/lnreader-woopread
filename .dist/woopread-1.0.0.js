"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = function(cb, mod) {
  return function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
};

// .tsc-build/parsers.js
var require_parsers = __commonJS({
  ".tsc-build/parsers.js": function(exports2) {
    "use strict";
    var __values = exports2 && exports2.__values || function(o) {
      var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number") return {
        next: function() {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        }
      };
      throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MAX_PAGE_CHARS = void 0;
    exports2.decodeHtmlEntities = decodeHtmlEntities;
    exports2.unescapeRscString = unescapeRscString;
    exports2.absolutizeImageUrl = absolutizeImageUrl;
    exports2.pickSrcsetEntry = pickSrcsetEntry;
    exports2.parseCatalogCards = parseCatalogCards;
    exports2.parseTotalPages = parseTotalPages;
    exports2.parseNovelDetails = parseNovelDetails;
    exports2.parseChapterListFromRsc = parseChapterListFromRsc;
    exports2.parseChapterListFromHtml = parseChapterListFromHtml;
    exports2.sanitizeChapterHtml = sanitizeChapterHtml;
    exports2.parseChapterContent = parseChapterContent;
    exports2.MAX_PAGE_CHARS = 1e7;
    var HTML_ENTITY_CHARS = {
      amp: "&",
      quot: '"',
      "#39": "'",
      apos: "'",
      lt: "<",
      gt: ">",
      nbsp: " ",
      ndash: "\u2013",
      mdash: "\u2014",
      hellip: "\u2026",
      lsquo: "\u2018",
      rsquo: "\u2019",
      ldquo: "\u201C",
      rdquo: "\u201D"
    };
    function codePointToString(cp) {
      if (cp < 65536)
        return String.fromCharCode(cp);
      var v = cp - 65536;
      return String.fromCharCode(55296 + (v >> 10), 56320 + (v & 1023));
    }
    function decodeHtmlEntities(s) {
      return s.replace(/&(amp|quot|#39|apos|lt|gt|nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo);/g, function(m, e) {
        var _a;
        return (_a = HTML_ENTITY_CHARS[e]) !== null && _a !== void 0 ? _a : m;
      }).replace(/&#(\d+);/g, function(m, d) {
        var cp = parseInt(d, 10);
        return cp > 0 && cp <= 1114111 ? codePointToString(cp) : m;
      }).replace(/&#x([0-9a-fA-F]+);/g, function(m, h) {
        var cp = parseInt(h, 16);
        return cp > 0 && cp <= 1114111 ? codePointToString(cp) : m;
      });
    }
    function stripTags(s) {
      return s.replace(/<[^>]*>/g, "");
    }
    function cleanText(s) {
      return decodeHtmlEntities(stripTags(s)).replace(/\s+/g, " ").trim();
    }
    function checkSize(html) {
      if (html.length > exports2.MAX_PAGE_CHARS)
        throw new Error("Page too large to parse");
    }
    function unescapeRscString(s) {
      return s.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, function(_m, esc) {
        if (esc.charAt(0) === "u") {
          var cp = parseInt(esc.slice(1), 16);
          return !isNaN(cp) ? codePointToString(cp) : _m;
        }
        switch (esc) {
          case '"':
            return '"';
          case "\\":
            return "\\";
          case "/":
            return "/";
          case "b":
            return "\b";
          case "f":
            return "\f";
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "	";
          default:
            return _m;
        }
      });
    }
    function absolutizeImageUrl(src) {
      var out = decodeHtmlEntities(src).trim();
      if (out.indexOf("//") === 0)
        return "https:" + out;
      if (out.indexOf("http://") === 0)
        return "https://" + out.slice(7);
      if (out.charAt(0) === "/")
        return "https://woopread.com" + out;
      return out;
    }
    function pickSrcsetEntry(srcset, preferredWidth) {
      var e_1, _a;
      var entries = srcset.split(",");
      try {
        for (var entries_1 = __values(entries), entries_1_1 = entries_1.next(); !entries_1_1.done; entries_1_1 = entries_1.next()) {
          var e = entries_1_1.value;
          var url = e.trim().split(/\s+/)[0];
          if (url && url.indexOf("w=" + preferredWidth) !== -1)
            return url;
        }
      } catch (e_1_1) {
        e_1 = { error: e_1_1 };
      } finally {
        try {
          if (entries_1_1 && !entries_1_1.done && (_a = entries_1.return)) _a.call(entries_1);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
      var first = entries.length ? entries[0].trim().split(/\s+/)[0] : "";
      return first || "";
    }
    function parseCatalogCards(html) {
      checkSize(html);
      var cards = [];
      var seen = /* @__PURE__ */ new Set();
      var anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
      var m;
      while ((m = anchorRe.exec(html)) !== null) {
        var attrs = m[1];
        var cls = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
        if (!cls || /(^|\s)block(\s|$)/.test(cls[1]) === false)
          continue;
        var href = /\bhref="(\/series\/[^"/]+)"/.exec(attrs);
        if (!href)
          continue;
        var path = href[1];
        if (seen.has(path))
          continue;
        var body = m[2];
        var img = /<img\b([^>]*)>/.exec(body);
        if (!img)
          continue;
        var name_1 = "";
        var h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(body);
        if (h2)
          name_1 = cleanText(h2[1]);
        if (!name_1) {
          var alt = /\balt="([^"]*)"/.exec(img[1]);
          if (alt) {
            name_1 = cleanText(alt[1]);
            if (name_1.indexOf("Cover image for ") === 0) {
              name_1 = name_1.slice("Cover image for ".length);
            }
          }
        }
        if (!name_1) {
          var h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(body);
          if (h3)
            name_1 = cleanText(h3[1]);
        }
        if (!name_1)
          continue;
        seen.add(path);
        var cover = void 0;
        var srcset = /\bsrcset="([^"]+)"/i.exec(img[1]);
        if (srcset) {
          var picked = pickSrcsetEntry(srcset[1], 256);
          if (picked)
            cover = absolutizeImageUrl(picked);
        }
        if (!cover) {
          var src = /\bsrc="([^"]+)"/.exec(img[1]);
          if (src)
            cover = absolutizeImageUrl(src[1]);
        }
        cards.push({ name: name_1, path: path, cover: cover });
      }
      return cards;
    }
    function parseTotalPages(html) {
      checkSize(html);
      var m = /Page\s*<!-- -->\s*(\d+)\s*<!-- -->\s*of\s*<!-- -->\s*(\d+)/.exec(html);
      if (m)
        return parseInt(m[2], 10) || 1;
      var plain = /Page\s+(\d+)\s+of\s+(\d+)/.exec(stripTags(html));
      return plain ? parseInt(plain[2], 10) || 1 : 1;
    }
    function labelledRow(html, label) {
      var re = new RegExp(label + "<!-- -->:</span>\\s*<(?:span|a)\\b[^>]*>([\\s\\S]*?)</(?:span|a)>");
      var m = re.exec(html);
      return m ? cleanText(m[1]) : "";
    }
    function divInnerById(html, id) {
      var openRe = new RegExp('<div\\b[^>]*\\bid="' + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>');
      var open = openRe.exec(html);
      if (!open)
        return "";
      var start = open.index + open[0].length;
      var depth = 1;
      var divRe = /<\/?div\b[^>]*>/g;
      divRe.lastIndex = start;
      var m;
      while ((m = divRe.exec(html)) !== null) {
        if (m[0].charAt(1) === "/") {
          depth--;
          if (depth === 0)
            return html.slice(start, m.index);
        } else if (m[0].slice(-2) !== "/>") {
          depth++;
        }
      }
      return "";
    }
    function parseNovelDetails(html) {
      checkSize(html);
      var name = "";
      var h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      if (h1)
        name = cleanText(h1[1]);
      var cover = "";
      var coverImg = /<img\b([^>]*)>/g;
      var im;
      while ((im = coverImg.exec(html)) !== null) {
        var alt = /\balt="([^"]*)"/.exec(im[1]);
        if (alt && name && cleanText(alt[1]) === name) {
          var srcset = /\bsrcset="([^"]+)"/i.exec(im[1]);
          if (srcset) {
            var picked = pickSrcsetEntry(srcset[1], 640);
            if (picked)
              cover = absolutizeImageUrl(picked);
          }
          if (!cover) {
            var src = /\bsrc="([^"]+)"/.exec(im[1]);
            if (src)
              cover = absolutizeImageUrl(src[1]);
          }
          break;
        }
      }
      var descHtml = divInnerById(html, "novel-description-content");
      var paras = [];
      var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
      var pm;
      while ((pm = pRe.exec(descHtml)) !== null) {
        var t = cleanText(pm[1]);
        if (t)
          paras.push(t);
      }
      var genres = [];
      var genreRe = /<a\b[^>]*href="\/browse\?genres=([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      var gm;
      while ((gm = genreRe.exec(html)) !== null) {
        var label = cleanText(gm[2]);
        if (label && genres.indexOf(label) === -1)
          genres.push(label);
      }
      var totalM = /(\d+)<!-- --> <!-- -->chapters/.exec(html);
      return {
        name: name,
        cover: cover,
        summary: paras.join("\n\n"),
        author: labelledRow(html, "Author"),
        translator: labelledRow(html, "Translator"),
        genres: genres,
        statusRaw: labelledRow(html, "Status"),
        totalChapters: totalM ? parseInt(totalM[1], 10) : 0
      };
    }
    function parseChapterListFromRsc(html) {
      var e_2, _a;
      checkSize(html);
      var scoped = html;
      var marker = html.indexOf('\\"chapters\\":[{');
      if (marker >= 0) {
        var end = html.indexOf("}]", marker);
        if (end >= 0)
          scoped = html.slice(marker, end + 2);
        else
          scoped = html.slice(marker);
      }
      var entries = [];
      var seen = /* @__PURE__ */ new Set();
      var re = /\\"title\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\",\\"number\\":(\d+),\\"slug\\":\\"([^\\]+)\\"/g;
      var m;
      while ((m = re.exec(scoped)) !== null) {
        var number = parseInt(m[2], 10);
        if (isNaN(number) || seen.has(number))
          continue;
        seen.add(number);
        var slug = m[3];
        if (!slug)
          continue;
        entries.push({
          slug: slug,
          title: unescapeRscString(m[1]),
          number: number
        });
      }
      entries.sort(function(a, b) {
        return a.number - b.number;
      });
      var dateRe = /\\"slug\\":\\"([^\\]+)\\",\\"groupId\\":[^,]*,\\"groupNumber\\":[^,]*,\\"publishDate\\":\\"([^\\]+)\\"/g;
      var dates = {};
      while ((m = dateRe.exec(scoped)) !== null)
        dates[m[1]] = m[2];
      try {
        for (var entries_2 = __values(entries), entries_2_1 = entries_2.next(); !entries_2_1.done; entries_2_1 = entries_2.next()) {
          var e = entries_2_1.value;
          if (dates[e.slug])
            e.publishDate = dates[e.slug];
        }
      } catch (e_2_1) {
        e_2 = { error: e_2_1 };
      } finally {
        try {
          if (entries_2_1 && !entries_2_1.done && (_a = entries_2.return)) _a.call(entries_2);
        } finally {
          if (e_2) throw e_2.error;
        }
      }
      return entries;
    }
    function parseChapterListFromHtml(html, novelSlug) {
      checkSize(html);
      var entries = [];
      var seen = /* @__PURE__ */ new Set();
      var re = new RegExp('<a\\b[^>]*href="\\/series\\/' + novelSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\/([^"/]+)"[^>]*>([\\s\\S]*?)</a>', "g");
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = m[1];
        var text = cleanText(m[2]);
        var number = NaN;
        var slugNum = /^chapter-(\d+)-/.exec(slug);
        if (slugNum)
          number = parseInt(slugNum[1], 10);
        if (isNaN(number)) {
          var textNum = /^Chapter (\d+)\b/.exec(text);
          if (textNum)
            number = parseInt(textNum[1], 10);
        }
        if (isNaN(number))
          number = entries.length + 1;
        if (seen.has(number))
          continue;
        seen.add(number);
        entries.push({
          slug: slug,
          title: text && text !== "Read Now" ? text : "Chapter " + number,
          number: number
        });
      }
      entries.sort(function(a, b) {
        return a.number - b.number;
      });
      return entries;
    }
    function sanitizeChapterHtml(html) {
      var noExecutable = html.replace(/<(script|style|noscript|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<(script|style|noscript|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, "");
      return noExecutable.replace(/<(?:\"[^\"]*\"|'[^']*'|[^>\"'])*>/g, function(tag) {
        return tag.replace(/[\s/](on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/[\s/]style\s*=\s*(?:"[^"]*"|'[^']*')/gi, "").replace(/[\s/](?:href|src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, function(m) {
          return isSafeUrlValue(m) ? m : "";
        });
      });
    }
    function decodeEntities(value) {
      var out = value;
      for (var i = 0; i < 3; i++) {
        var next = out.replace(/&#(\d+);?/g, function(_m, code) {
          var n = parseInt(code, 10);
          return !isNaN(n) && n >= 0 && n <= 1114111 ? String.fromCharCode(n) : _m;
        }).replace(/&#[xX]([0-9a-fA-F]+);?/g, function(_m, code) {
          var n = parseInt(code, 16);
          return !isNaN(n) && n >= 0 && n <= 1114111 ? String.fromCharCode(n) : _m;
        }).replace(/&colon;/g, ":").replace(/&Tab;/g, "	").replace(/&NewLine;/g, "\n").replace(/&sol;/g, "/").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp(?![a-zA-Z0-9=])/g, "&").replace(/&lt(?![a-zA-Z0-9=])/g, "<").replace(/&gt(?![a-zA-Z0-9=])/g, ">").replace(/&quot(?![a-zA-Z0-9=])/g, '"');
        if (next === out)
          break;
        out = next;
      }
      return out;
    }
    function attrValue(attr) {
      var eq = attr.indexOf("=");
      if (eq < 0)
        return "";
      var rest = attr.slice(eq + 1).replace(/^\s+/, "");
      if (rest.charAt(0) === '"') {
        var end = rest.indexOf('"', 1);
        return end < 0 ? rest.slice(1) : rest.slice(1, end);
      }
      if (rest.charAt(0) === "'") {
        var end = rest.indexOf("'", 1);
        return end < 0 ? rest.slice(1) : rest.slice(1, end);
      }
      var m = /^[^\s>]+/.exec(rest);
      return m ? m[0] : "";
    }
    function isSafeUrlValue(attr) {
      var clean = decodeEntities(attrValue(attr)).split("").filter(function(ch) {
        var code = ch.charCodeAt(0);
        return code > 32 && code !== 127;
      }).join("").toLowerCase();
      var scheme = /^([a-z][a-z0-9+.-]*):/.exec(clean);
      if (scheme) {
        return scheme[1] === "http" || scheme[1] === "https";
      }
      return true;
    }
    function parseChapterContent(html) {
      checkSize(html);
      var clean = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
      var parts = [];
      var openRe = /<div\b[^>]*data-paragraph-index="\d+"[^>]*>/g;
      var m;
      while ((m = openRe.exec(clean)) !== null) {
        var start = m.index + m[0].length;
        var depth = 1;
        var divRe = /<\/?div\b[^>]*>/g;
        divRe.lastIndex = start;
        var dm = void 0;
        var end = -1;
        while ((dm = divRe.exec(clean)) !== null) {
          if (dm[0].charAt(1) === "/") {
            depth--;
            if (depth === 0) {
              end = dm.index;
              break;
            }
          } else if (dm[0].slice(-2) !== "/>") {
            depth++;
          }
        }
        if (end < 0)
          continue;
        var body = clean.slice(start, end);
        var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
        var pm = void 0;
        var found = false;
        while ((pm = pRe.exec(body)) !== null) {
          parts.push("<p>" + pm[1].trim() + "</p>");
          found = true;
        }
        var imgRe = /<img\b[^>]*>/g;
        var im = void 0;
        while ((im = imgRe.exec(body)) !== null) {
          parts.push(im[0]);
          found = true;
        }
        if (!found) {
          var text = cleanText(body);
          if (text)
            parts.push("<p>" + text + "</p>");
        }
      }
      if (parts.length === 0)
        return "";
      return sanitizeChapterHtml(parts.join("\n"));
    }
  }
});

// .tsc-build/plugin.js
var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = exports && exports.__generator || function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
Object.defineProperty(exports, "__esModule", { value: true });
var parsers_1 = require_parsers();
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function fetchRaw(url) {
  return __awaiter(this, void 0, void 0, function() {
    var res, status_1, text, _a, retryAfter, rawHeader, parsed;
    var _b;
    return __generator(this, function(_c) {
      switch (_c.label) {
        case 0:
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 5];
          return [4, fetchLib.fetchApi(url)];
        case 1:
          res = _c.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (!(res && typeof res.text === "function")) return [3, 3];
          return [4, res.text()];
        case 2:
          _a = _c.sent();
          return [3, 4];
        case 3:
          _a = "";
          _c.label = 4;
        case 4:
          text = _a;
          retryAfter = void 0;
          rawHeader = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : void 0;
          if (typeof rawHeader === "string") {
            parsed = parseInt(rawHeader, 10);
            if (!isNaN(parsed) && parsed >= 0)
              retryAfter = Math.min(parsed, 10);
          }
          return [2, { status: status_1, retryAfter: retryAfter, text: text }];
        case 5:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 7];
          _b = {};
          return [4, fetchLib.fetchText(url)];
        case 6:
          return [2, (_b.text = _c.sent(), _b)];
        case 7:
          throw new Error("No fetch implementation provided by the host app");
      }
    });
  });
}
function statusFromError(e) {
  var m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
function fetchText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_2, retryAfterSecs, res, e_1, msg, retryable, waitSecs;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _a.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 7];
          status_2 = void 0;
          retryAfterSecs = void 0;
          _a.label = 2;
        case 2:
          _a.trys.push([2, 4, , 6]);
          return [4, withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _a.sent();
          status_2 = res.status;
          retryAfterSecs = res.retryAfter;
          if (status_2 === 429 || status_2 !== void 0 && status_2 >= 500) {
            throw new Error("Server responded with HTTP " + status_2);
          }
          return [2, res.text];
        case 4:
          e_1 = _a.sent();
          lastError = e_1;
          if (status_2 === void 0)
            status_2 = statusFromError(e_1);
          if (status_2 !== void 0)
            lastError.status = status_2;
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_2 === void 0 || status_2 === 429 || status_2 >= 500 || /timed out|timeout|Network|network|fetch failed/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS)
            throw lastError;
          waitSecs = status_2 === 429 && retryAfterSecs !== void 0 ? retryAfterSecs : Math.pow(2, attempt - 1);
          return [4, sleep(1e3 * waitSecs)];
        case 5:
          _a.sent();
          return [3, 6];
        case 6:
          attempt++;
          return [3, 1];
        case 7:
          throw lastError;
      }
    });
  });
}
var WoopReadPlugin = (
  /** @class */
  (function() {
    function WoopReadPlugin2() {
      var _this = this;
      this.id = "woopread";
      this.name = "WoopRead";
      this.icon = "src/en/woopread/icon.png";
      this.site = "https://woopread.com";
      this.version = "1.0.0";
      this.resolveUrl = function(path, _isNovel) {
        if (/^https?:\/\//i.test(path))
          return path;
        if (path.indexOf("//") === 0)
          return "https:" + path;
        return _this.site + path;
      };
    }
    WoopReadPlugin2.prototype.popularNovels = function(pageNo, options) {
      return __awaiter(this, void 0, void 0, function() {
        var sort, html;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              sort = options && options.showLatestNovels ? "New" : "Rating";
              return [4, fetchText("".concat(this.site, "/browse?sortBy=").concat(sort, "&page=").concat(pageNo))];
            case 1:
              html = _a.sent();
              if (pageNo > (0, parsers_1.parseTotalPages)(html))
                return [2, []];
              return [2, (0, parsers_1.parseCatalogCards)(html)];
          }
        });
      });
    };
    WoopReadPlugin2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var parts, slug, html, details, entries, chapters, statusRaw, status;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              parts = novelPath.split("/").filter(function(p) {
                return p.length > 0;
              });
              if (parts.length !== 2 || parts[0] !== "series") {
                throw new Error("Unexpected novel path: " + novelPath);
              }
              slug = parts[1];
              return [4, fetchText(this.site + novelPath)];
            case 1:
              html = _a.sent();
              details = (0, parsers_1.parseNovelDetails)(html);
              if (!details.name) {
                throw new Error("Could not parse the novel page for " + novelPath);
              }
              entries = (0, parsers_1.parseChapterListFromRsc)(html);
              if (entries.length === 0) {
                entries = (0, parsers_1.parseChapterListFromHtml)(html, slug);
              }
              if (entries.length === 0) {
                throw new Error("No chapters found for " + novelPath);
              }
              chapters = entries.map(function(e) {
                return {
                  name: e.title,
                  path: "/series/".concat(slug, "/").concat(e.slug),
                  releaseTime: e.publishDate,
                  chapterNumber: e.number
                };
              });
              statusRaw = details.statusRaw.toLowerCase();
              status = statusRaw === "completed" ? NovelStatus.Completed : statusRaw === "ongoing" ? NovelStatus.Ongoing : statusRaw === "hiatus" || statusRaw === "on hiatus" ? NovelStatus.OnHiatus : statusRaw === "dropped" || statusRaw === "cancelled" ? NovelStatus.Cancelled : NovelStatus.Unknown;
              return [2, {
                path: novelPath,
                name: details.name,
                cover: details.cover || void 0,
                summary: details.summary || void 0,
                author: details.author || void 0,
                genres: details.genres.length ? details.genres.join(", ") : void 0,
                status: status,
                chapters: chapters
              }];
          }
        });
      });
    };
    WoopReadPlugin2.prototype.parsePage = function(novelPath, _pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var novel;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.parseNovel(novelPath)];
            case 1:
              novel = _a.sent();
              return [2, novel.chapters || []];
          }
        });
      });
    };
    WoopReadPlugin2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var html, content, text;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText(this.site + chapterPath)];
            case 1:
              html = _a.sent();
              content = (0, parsers_1.parseChapterContent)(html);
              if (!content) {
                throw new Error("Chapter content not found on the page");
              }
              text = content.replace(/<[^>]*>/g, "").trim();
              if (text.length < 200) {
                throw new Error("Chapter looks empty or locked, open it on the site to check");
              }
              return [2, content];
          }
        });
      });
    };
    WoopReadPlugin2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var html;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText("".concat(this.site, "/search?q=").concat(encodeURIComponent(searchTerm), "&page=").concat(pageNo))];
            case 1:
              html = _a.sent();
              return [2, (0, parsers_1.parseCatalogCards)(html)];
          }
        });
      });
    };
    return WoopReadPlugin2;
  })()
);
exports.default = new WoopReadPlugin();
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
