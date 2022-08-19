# DoTx

<img alt="npm" src="https://img.shields.io/npm/v/dotx"> <img alt="npm" src="https://img.shields.io/npm/dm/dotx?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/dotx"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/dotx">

Small, fast and powerfull temlate engine - [online demo](https://udamir.github.io/dotx/)

This engine is based on [doT.js](https://github.com/olado/doT) by Laura Doktorova [@olado](http://twitter.com/olado)

### Differences from original package `dot@beta`:
- TypeScript syntax
- Nested templates with param support: `{{$def.nested:it.data}}`
- Stripe option is `false` by default
- `{{# }}`, `{{? }}`, `{{~ }}` blocks are not adding line breaks in template
- Removed delimiter configuration globally via `SetDelimiters`
- Jest tests instead of Mocha

## Features
- Runtime evaluation and interpolation
- Compile-time evaluation
- PartiNested templates support
- Conditionals support
- Array iterators
- Control whitespace - strip or preserve
- Streaming friendly
- Typescript syntax support out of the box
- No dependencies, can be used in nodejs or browser

## Installation
```SH
npm install dotx --save
```

## Usage

### Nodejs
```ts
import { template } from 'dotx'

const t = template("<div>Hi {{=it.name}}!</div>\n<div>{{=it.age || ''}}</div>")

console.log(t({ name: "Jake", age: 31 }))
// <div>Hi Jake!</div>
// <div>31</div>
```

## Security considerations

doTx allows arbitrary JavaScript code in templates, making it one of the most flexible and powerful templating engines. It means that doTx security model assumes that you only use trusted templates and you don't use any user input as any part of the template, as otherwise it can lead to code injection.

It is strongly recommended to compile all templates to JS code as early as possible. Possible options:

- using doTx as dev-dependency only and compiling templates to JS files, for example, as described above or using a custom script, during the build. This is the most performant and secure approach and it is strongly recommended.
- if the above approach is not possible for some reason (e.g. templates are dynamically generated using some run-time data), it is recommended to compile templates to in-memory functions during application start phase, before any external input is processed.
- compiling templates lazily, on demand, is less safe. Even though the possibility of the code injection via prototype pollution was patched (#291), there may be some other unknown vulnerabilities that could lead to code injection.


## Contributing
When contributing, keep in mind that it is an objective of `dotx` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the unit tests before submitting your PR: `npm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
