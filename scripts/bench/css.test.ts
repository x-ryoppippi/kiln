import { describe, expect, it } from "vite-plus/test";

import { rulesOf } from "./css.ts";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("rulesOf", () => {
  it("reads nishiki's output: rules inside layers, with layer statements between them", () => {
    expect(
      rulesOf("@layer n0{.na{padding:24px}.nb:hover{border:none}}@layer n1;@layer n2{.nc::backdrop{color:red}}"),
    ).toEqual([
      { name: "na", bytes: bytes(".na{padding:24px}") },
      { name: "nb", bytes: bytes(".nb:hover{border:none}") },
      { name: "nc", bytes: bytes(".nc::backdrop{color:red}") },
    ]);
  });

  it("ignores braces and semicolons inside strings, with escaped quotes", () => {
    const css = `.na{content:"}"}.nb{content:'{;'}.nc{content:"\\"}"}.ne{color:red}`;
    expect(rulesOf(css)).toEqual([
      { name: "na", bytes: bytes(`.na{content:"}"}`) },
      { name: "nb", bytes: bytes(`.nb{content:'{;'}`) },
      { name: "nc", bytes: bytes(`.nc{content:"\\"}"}`) },
      { name: "ne", bytes: bytes(".ne{color:red}") },
    ]);
  });

  it("reads an unquoted url() as one token, braces and semicolons included", () => {
    expect(rulesOf(".na{background:url(a}b;c.png)}.nb{background:url( 'x}.png' )}.nc{color:red}")).toEqual([
      { name: "na", bytes: bytes(".na{background:url(a}b;c.png)}") },
      { name: "nb", bytes: bytes(".nb{background:url( 'x}.png' )}") },
      { name: "nc", bytes: bytes(".nc{color:red}") },
    ]);
  });

  it("ignores comments and escaped braces", () => {
    expect(rulesOf(`/* } .nz{ */.na{color:red/* } */}.nb\\{y{color:blue}.nc{color:green}`)).toEqual([
      { name: "na", bytes: bytes(".na{color:red}") },
      { name: "nb", bytes: bytes(".nb\\{y{color:blue}") },
      { name: "nc", bytes: bytes(".nc{color:green}") },
    ]);
  });

  it("reads a {} block in a custom property's value as part of the value", () => {
    expect(rulesOf('.na{--x:{a:"}";b:c};color:red}.nb{color:blue}')).toEqual([
      { name: "na", bytes: bytes('.na{--x:{a:"}";b:c};color:red}') },
      { name: "nb", bytes: bytes(".nb{color:blue}") },
    ]);
  });

  it("counts a nested rule's parent with only its own declarations, as the CSSOM does", () => {
    expect(rulesOf(".na{color:red;&:hover{color:blue}margin:0}")).toEqual([
      { name: "na", bytes: bytes(".na{color:red;margin:0}") },
    ]);
  });

  it("does not count an at-rule's prelude as a selector", () => {
    expect(rulesOf("@container .na (min-width:1px){.nb{color:red}}")).toEqual([
      { name: "nb", bytes: bytes(".nb{color:red}") },
    ]);
  });

  it("counts bytes in UTF-8", () => {
    expect(rulesOf('.na{content:"→"}')).toEqual([{ name: "na", bytes: 18 }]);
  });
});
