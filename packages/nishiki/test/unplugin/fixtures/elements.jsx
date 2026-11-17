import { styled } from "@nishikijs/react";

const own = "mine";
const nothing = undefined;
const Base = styled("button", { color: "red", padding: 8, ":hover": { color: "blue" } });
const Wrapped = styled(Base, { color: "green", ":hover": { margin: 0 } });
const Input = styled("input", { width: 100 });
const Box = (props) => <section {...props} />;

export const ref = () => {};

// Each case renders elements whose classes and rules must not depend on whether the compiler ran.
export const cases = {
  plain: () => (
    <div css={{ color: "red", padding: 8, ":hover": { color: "blue" }, "@media (min-width: 40rem)": { margin: 4 } }}>
      text
    </div>
  ),
  firstAttribute: () => (
    <a css={{ color: "red" }} href="/x" id="link">
      go
    </a>
  ),
  lastAttribute: () => <a href="/x" css={{ color: "red" }} />,
  literalClassName: () => <p className="own" css={{ color: "red" }} />,
  literalClassNameAfter: () => <p css={{ color: "red" }} className="own" title="t" />,
  emptyClassName: () => <p className="" css={{ color: "red" }} />,
  spacedClassName: () => <p className=" own " css={{ color: "red" }} />,
  entityClassName: () => <p className="a&amp;b" css={{ color: "red" }} />,
  expressionClassName: () => <p className={own} css={{ color: "red", margin: 0 }} />,
  expressionClassNameAfter: () => <p css={{ color: "red" }} className={`${own}-x`} />,
  undefinedClassName: () => <p className={nothing} css={{ color: "red" }} />,
  zeroClassName: () => <p className={0} css={{ color: "red" }} />,
  emptyStyle: () => <i css={{}} id="e" />,
  nullStyle: () => <i css={{ color: null }} className="own" />,
  overridden: () => <i css={{ ":hover": { color: "red" }, "&:hover": { color: "blue" }, padding: 1 }} />,
  keyed: () =>
    [1, 2].map((item) => (
      <li key={item} css={{ color: "red" }}>
        {item}
      </li>
    )),
  nested: () => (
    <div css={{ color: "red" }}>
      <span css={{ color: "blue" }}>
        <em className="x" css={{ margin: 1 }} />
      </span>
    </div>
  ),
  spread: () => <div {...{ id: "s", className: "spread" }} css={{ color: "red" }} />,
  spreadCss: () => <div {...{ css: { color: "blue" } }} id="t" />,
  component: () => <Box css={{ color: "red" }} id="c" />,
  dynamic: () => <div css={{ color: own.length > 2 ? "red" : "blue", margin: 0 }} />,
  list: () => <div css={[{ color: "red" }, own && { margin: 0 }]} />,
  literalList: () => (
    <div className="own" css={[{ color: "red", margin: 1 }, [null, { margin: 0 }, false], { color: "blue" }]} />
  ),
  emptyList: () => <i css={[[], null]} id="l" />,
  nullStyleOnElement: () => <i css={null} id="n" />,
  styled: () => (
    <Base css={{ margin: 0 }} className="own">
      go
    </Base>
  ),
  styledWithoutCss: () => <Base className="own" $tone="x" />,
  wrapped: () => <Wrapped css={{ padding: 2 }} className="own" />,
  wrappedWithoutCss: () => <Wrapped />,
  refs: () => (
    <>
      <Input ref={ref} />
      <input ref={ref} css={{ width: 1 }} />
      <input ref={ref} className="own" css={{ width: 2 }} />
    </>
  ),
};
