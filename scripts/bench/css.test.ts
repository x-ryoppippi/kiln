import { describe, expect, it } from "vite-plus/test";

import { rulesOf } from "./css.ts";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("rulesOf", () => {
  it("reads kiln's output: rules inside layers, with layer statements between them", () => {
    expect(
      rulesOf("@layer k0{.ka{padding:24px}.kb:hover{border:none}}@layer k1;@layer k2{.kc::backdrop{color:red}}"),
    ).toEqual([
      { name: "ka", bytes: bytes(".ka{padding:24px}") },
      { name: "kb", bytes: bytes(".kb:hover{border:none}") },
      { name: "kc", bytes: bytes(".kc::backdrop{color:red}") },
    ]);
  });

  it("ignores braces and semicolons inside strings, with escaped quotes", () => {
    const css = `.ka{content:"}"}.kb{content:'{;'}.kc{content:"\\"}"}.kd{color:red}`;
    expect(rulesOf(css)).toEqual([
      { name: "ka", bytes: bytes(`.ka{content:"}"}`) },
      { name: "kb", bytes: bytes(`.kb{content:'{;'}`) },
      { name: "kc", bytes: bytes(`.kc{content:"\\"}"}`) },
      { name: "kd", bytes: bytes(".kd{color:red}") },
    ]);
  });

  it("reads an unquoted url() as one token, braces and semicolons included", () => {
    expect(rulesOf(".ka{background:url(a}b;c.png)}.kb{background:url( 'x}.png' )}.kc{color:red}")).toEqual([
      { name: "ka", bytes: bytes(".ka{background:url(a}b;c.png)}") },
      { name: "kb", bytes: bytes(".kb{background:url( 'x}.png' )}") },
      { name: "kc", bytes: bytes(".kc{color:red}") },
    ]);
  });

  it("ignores comments and escaped braces", () => {
    expect(rulesOf(`/* } .kz{ */.ka{color:red/* } */}.kb\\{y{color:blue}.kc{color:green}`)).toEqual([
      { name: "ka", bytes: bytes(".ka{color:red}") },
      { name: "kb", bytes: bytes(".kb\\{y{color:blue}") },
      { name: "kc", bytes: bytes(".kc{color:green}") },
    ]);
  });

  it("reads a {} block in a custom property's value as part of the value", () => {
    expect(rulesOf('.ka{--x:{a:"}";b:c};color:red}.kb{color:blue}')).toEqual([
      { name: "ka", bytes: bytes('.ka{--x:{a:"}";b:c};color:red}') },
      { name: "kb", bytes: bytes(".kb{color:blue}") },
    ]);
  });

  it("counts a nested rule's parent with only its own declarations, as the CSSOM does", () => {
    expect(rulesOf(".ka{color:red;&:hover{color:blue}margin:0}")).toEqual([
      { name: "ka", bytes: bytes(".ka{color:red;margin:0}") },
    ]);
  });

  it("does not count an at-rule's prelude as a selector", () => {
    expect(rulesOf("@container .ka (min-width:1px){.kb{color:red}}")).toEqual([
      { name: "kb", bytes: bytes(".kb{color:red}") },
    ]);
  });

  it("counts bytes in UTF-8", () => {
    expect(rulesOf('.ka{content:"→"}')).toEqual([{ name: "ka", bytes: 18 }]);
  });
});
