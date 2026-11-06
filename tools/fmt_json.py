"""Rewrite config JSON compactly: short arrays/objects stay on one line (easier to tune by hand)."""
import json
import sys


def dump(v, ind=0, width=150):
    one = json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    if not isinstance(v, (dict, list)) or len(one) + ind <= width:
        return one
    pad = "  " * (ind // 2 + 1)
    if isinstance(v, list):
        if all(not isinstance(x, (dict, list)) for x in v) or all(isinstance(x, list) for x in v):
            # wrap long primitive / step lists across lines but keep items inline
            parts, line, lines = [json.dumps(x, ensure_ascii=False, separators=(", ", ": ")) for x in v], "", []
            for p in parts:
                if len(line) + len(p) + len(pad) > width:
                    lines.append(line.rstrip())
                    line = ""
                line += p + ", "
            lines.append(line.rstrip(", "))
            return "[\n" + ",\n".join(pad + l.rstrip(",") for l in lines) + "\n" + pad[:-2] + "]"
        return "[\n" + ",\n".join(pad + dump(x, ind + 2, width) for x in v) + "\n" + pad[:-2] + "]"
    items = [f"{pad}{json.dumps(k, ensure_ascii=False)}: {dump(x, ind + 2, width)}" for k, x in v.items()]
    return "{\n" + ",\n".join(items) + "\n" + pad[:-2] + "}"


for path in sys.argv[1:]:
    data = json.load(open(path, encoding="utf-8"))
    out = dump(data) + "\n"
    assert json.loads(out) == data
    open(path, "w", encoding="utf-8").write(out)
    print(path, len(out.splitlines()), "lines")
