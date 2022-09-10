const EOL = "[\\t ]*(?:\\r\\n|\\r|\\n|\\x13|$)"
const BOL = "(?:\\r\\n|\\r|\\n|\\x13|^)[\\t ]*"

export type Encoder = (data: any) => string

export interface TemplateOptions {
  argName: string // default argument name
  encoders: Record<string, Encoder | string>
  strip: boolean
  varName: string // internal variable name
  defsName: string // internal definitions name
  delimiters: [string, string]
  def: Definitions
}

export type RenderFunction = (...args: any[]) => string
type RuleContext = TemplateOptions & { id: number, dependency: Set<string>, start: string, end: string, nested?: boolean }
type SyntaxRule = (template: string, ctx: RuleContext) => string
type Definitions = Record<string, Function | any>
type TypePrefix = "n" | "s" | "b"

const TYPES: Record<TypePrefix, string> = { n: "number", s: "string", b: "boolean" }

const escape = (str: string) => str.replace(/([{}[\]()<>\\\/^$\-.+*?!=|&:])/g, "\\$1")
const unescape = (code: string) => code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, " ")

const inlineTemplate: SyntaxRule = (t, ctx): string => {
  const { start, end, def } = ctx
  return t.replace(
    new RegExp(`(?:${BOL})?${start}##\\s*([\\w\\.$]+)\\s*(?:\\:\\s*((?:\\{\\s*[\\s\\S]+?\\s*\\})|(?:[\\w]+?)))?[ ]*(\\:|=)(?:${EOL})?([\\s\\S]+?)#${end}(?:\\s*)?`, "g"),
    (_, code: string, argName: string, assign: string, tmpl: string) => {
      if (code.indexOf("def.") === 0) {
        code = code.substring(4)
      }
      if (!(code in def)) {
        if (assign === ":") {
          def[code] = { argName: argName || ctx.argName, tmpl }
        } else {
          if (argName) {
            throw new Error(`Unexpected arguments: ${_}`)
          }
          new Function("def", `def['${code}']=${tmpl}`)(def)
        }
      }
      return ""
    }
  )
}

const resolveDefs: SyntaxRule = (t, ctx): string => {
  const { start, end, def, dependency, defsName } = ctx
  return t.replace(
    // (?:(?:\r\n|\r|\n|^)[\t ]*)?\{\{#\s*def(?:\.|\[[\'\"])([\w$]+)(?:[\'\"]\])?\s*(?:\:\s*([\s\S]+?\}?))?\s*\}\}(?:[\t ]*(?:\r\n|\r|\n|$))?
    new RegExp(`(${BOL})?${start}#\\s*def(?:\\.|\\[[\\'\\"])([\\w$]+)(?:[\\'\\"]\\])?\\s*(?:\\:\\s*([\\s\\S\\}]+?\\}?))?\\s*${end}(${EOL})?`, "g"),
    (_, bol="", name: string, param: string, eol="") => {
      bol = bol.replace(/[\t ]*/g, "")
      if (typeof def[name] === "string") {
        let tmpl = def[name]
        tmpl = param ? tmpl.replace(new RegExp(`(^|[^\\w$])${ctx.argName}([^\\w$])`, "g"),`$1${param}$2`) : tmpl
        return bol + (tmpl ? resolveDefs(tmpl, ctx) : tmpl) + (eol ? "\x13" : "")
      }
      if (!dependency.has(`def.${name}`)) {
        dependency.add(`def.${name}`)
        if (typeof def[name] === "object") {
          const { tmpl, argName } = def[name]
          def[name] = buildFn(tmpl, { ...ctx, argName, nested: true })
        }
      }
      return `${bol}{{=${defsName}.${name}(${param ? stripTemplate(param, { ...ctx, strip: true }) : ctx.argName})}}${eol ? "\x13" : ""}`
    }
  )
}

const stripTemplate: SyntaxRule = (t, { strip }) => 
  !strip ? t : t.trim()
    .replace(/[\t ]+(\r|\n)/g, "\n") // remove trailing spaces
    .replace(/(\r|\n)[\t ]+/g, "") // remove leading spaces
    .replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g, "") // remove breaks, tabs and JS comments

const escapeQuotes: SyntaxRule = (t) => t.replace(/'|\\/g, "\\$&")

const interpolate: SyntaxRule = (t, { argName, start, end, varName: v }) =>
  t.replace(
    new RegExp(`${start}(?:\\:\\s*((?:\\{[\\s\\S]+?\\})|(?:[\\w]+?))\\s*)?=([\\s\\S]+?)${end}`, "g"),
    (_, arg, code) => arg 
        ? `';{const ${arg}=${argName};${v}[0]+=(${unescape(code)})};${v}[0]+='` 
        : `'+(${unescape(code)})+'`
  )

const removeSpaces: SyntaxRule = (t, { start, end }) =>
  t.replace(new RegExp(`(\\s*)?${start}-${end}(\\s*)?`, "g"), "")

const typeInterpolate: SyntaxRule = (t, ctx) => {
  const { start, end, varName: v } = ctx
  return t.replace(
    new RegExp(`${start}%([nsb])=([\\s\\S]+?)${end}`, "g"),
    (_, typ: TypePrefix, code) => {
      const val = `${v}[${ctx.id++}]`
      const error = `throw new Error("expected ${TYPES[typ]}, got "+ (typeof ${val}))`
      return `';${val}=(${unescape(code)});if(typeof ${val}!=="${TYPES[typ]}") ${error};${v}[0]+=${val}+'`
    }
  )
}

const encode: SyntaxRule = (t, { start, end, dependency, defsName }) => 
  t.replace(
    new RegExp(`${start}([a-z_$]+[\\w$]*)?!([\\s\\S]+?)${end}`,"g"), 
    (_, enc = "", code) => {
      dependency.add(enc || "")
      return `'+${defsName}.${enc || "html"}(${unescape(code)})+'`
    }
  )

const conditional: SyntaxRule = (t, { varName: v, start, end }) =>
  t.replace(
    new RegExp(`(${BOL})?${start}\\?(\\?)?\\s*([\\s\\S]*?)\\s*${end}(${EOL})?`, "g"),
    (_, bol="", elseCase, code, eol="") => {
      bol = bol.replace(/[\t ]*/g, "")
      return code
        ? `${bol}';${elseCase ? "}else " : ""}if(${unescape(code)}){${v}[0]+='${eol ? "\x13" : ""}`
        : elseCase ? `${bol}';}else{${v}[0]+='` : `';}${v}[0]+='${eol ? "\x13" : ""}`
    }
  )

const iterate: SyntaxRule = (t, ctx) => {
  const { varName: v, start, end } = ctx
  return t.replace(
    new RegExp(`(${BOL})?${start}(~+)\\s*(?:${end}|([\\s\\S]+?)\\s*\\:\\s*([\\w$]+)\\s*(?:\\:\\s*([\\w$]+))?\\s*${end})(${EOL})?`,"g"), 
    (_, bol="", loop, arr, vName, iName, eol="") => {
      bol = bol.replace(/[\t ]*/g, "")
      if (!arr) return `';}${v}[0]+='`
      const [defI, incI] = iName ? [`let ${iName}=-1;`,`${iName}++;`] : ["", ""]
      switch (loop) {
        case "~":
          return `${bol}';${defI}for (const ${vName} of ${unescape(arr)} || []){${incI}${v}[0]+='${eol ? "\x13" : ""}`
        case "~~":
          const iter = iName ? `[${iName}, ${vName}] of Object.entries` : `${vName} of Object.values`
          return `${bol}';for (const ${iter}(${unescape(arr)} || {})){${v}[0]+='${eol ? "\x13" : ""}`
        default:
          throw new Error(`unsupported syntax: ${loop} ${arr}:${vName}`)
      }
    }
  )
}

const evaluate: SyntaxRule = (t, { varName: tmp, start, end }) => 
  t.replace(
    new RegExp(`${start}([\\s\\S]+?(\\}?)+)${end}`,"g"), 
    (_, code) => `';${unescape(code)};${tmp}[0]+='`
  )

const rules: SyntaxRule[] = [
  inlineTemplate,
  resolveDefs,
  stripTemplate,
  escapeQuotes,
  iterate,
  conditional,
  interpolate,
  typeInterpolate,
  encode,
  removeSpaces,
  evaluate
]

/* istanbul ignore next */
export const encodeHtml = (s: any) => {
  const rules: Record<string, string> = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': "&#34;", "'": "&#39;", "/": "&#47;" }
  return typeof s === "string" ? s.replace(/&(?!#?\w+;)|<|>|"|'|\//g, (m) => rules[m] || m) : s
}

const defaultOptions: TemplateOptions = {
  argName: "it",
  varName: "$",
  defsName: "$$",
  delimiters: ["{{", "}}"],
  encoders: { "": encodeHtml },
  strip: false,
  def: {}
}

const buildFn = (body: string, ctx: RuleContext): RenderFunction => {
  const { argName, varName: tmp, nested, defsName } = ctx
  rules.forEach((rule) => body = rule(body, ctx))

  body = (`;${tmp}[0]='${body}';return ${tmp}[0];`)
    .replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r") // replace eol
    .replace(new RegExp(`(\\s|;|\\}|^|\\{)${escape(tmp)}\\[0\\]\\+='';`, "g"), "$1") // remove empty strings
    .replace(/\+''|\x13/g, "")
  
  let defs = nested ? "" : [...ctx.dependency]
    .map((dep) => `${dep.indexOf("def.") !== 0 ? dep || 'html' : dep.slice(4) }: ${depFunc(dep, ctx)}`)
    .join(",")
  defs = defs ? `;const ${defsName}={${defs}}` : ""
  body = `const ${tmp}=[]${defs}${body}`
  return new Function(argName, body) as RenderFunction
}

export const template = (body: string, options?: Partial<TemplateOptions>): RenderFunction => {
  const opts = { ...defaultOptions, def: {}, ...options } as TemplateOptions
  const [s,e] = opts.delimiters
  const dependency = new Set<string>()
  return buildFn(body, { ...opts, id: 1, dependency, start: escape(s), end: escape(e) })
}

const depFunc = (dep: string, ctx: RuleContext) => {
  const enc = dep.indexOf("def.") !== 0
  const fn =  enc ? ctx.encoders[dep] : ctx.def[dep.substring(4)]
  if (!fn) {
    throw new Error(`Unknown ${ enc ? "encoder" : "definition" } "${dep}"`)
  }
  if (typeof fn === "function") {
    const code = fn.toString()
    if (code.indexOf("[native code]") > -1) {
      throw new Error(`Native function '${dep}' should be added to encoders as a string`)
    }
    return code
  }
  return fn
} 
