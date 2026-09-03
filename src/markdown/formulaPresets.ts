export interface FormulaPresetGroup {
  id: string;
  label: string;
  items: readonly string[];
}

// 分类和符号取自《LaTeX 2ε 用户手册》3.10“数学符号表”（用户提供的 7 页 PDF）。
// 每次只渲染当前分类，避免一次排版数百个 MathJax 节点拖慢对话框。
export const FORMULA_PRESET_GROUPS: readonly FormulaPresetGroup[] = [
  {
    id: "common-structures",
    label: "常用公式结构",
    items: [
      "\\frac{a}{b}", "\\sqrt{x}", "\\sqrt[n]{x}", "x^{2}", "x_{i}", "\\sum_{i=1}^{n}",
      "\\prod_{i=1}^{n}", "\\int_{a}^{b} f(x)\\,dx", "\\lim_{x\\to 0}", "\\binom{n}{k}",
      "\\begin{bmatrix}a & b\\\\c & d\\end{bmatrix}", "\\begin{pmatrix}a & b\\\\c & d\\end{pmatrix}",
      "\\begin{cases}a,&x>0\\\\b,&x\\leq 0\\end{cases}", "\\overline{AB}", "\\underline{x}",
    ],
  },
  {
    id: "accents",
    label: "3.1 数学模式重音符",
    items: [
      "\\hat{a}", "\\check{a}", "\\tilde{a}", "\\acute{a}", "\\grave{a}", "\\dot{a}",
      "\\ddot{a}", "\\breve{a}", "\\bar{a}", "\\vec{a}", "\\widehat{ABC}", "\\widetilde{ABC}",
    ],
  },
  {
    id: "greek-lower",
    label: "3.2 小写希腊字母",
    items: [
      "\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\varepsilon", "\\zeta", "\\eta",
      "\\theta", "\\vartheta", "\\iota", "\\kappa", "\\lambda", "\\mu", "\\nu", "\\xi", "o",
      "\\pi", "\\varpi", "\\rho", "\\varrho", "\\sigma", "\\varsigma", "\\tau", "\\upsilon",
      "\\phi", "\\varphi", "\\chi", "\\psi", "\\omega",
    ],
  },
  {
    id: "greek-upper",
    label: "3.3 大写希腊字母",
    items: ["\\Gamma", "\\Delta", "\\Theta", "\\Lambda", "\\Xi", "\\Pi", "\\Sigma", "\\Upsilon", "\\Phi", "\\Psi", "\\Omega"],
  },
  {
    id: "relations",
    label: "3.4 二元关系符",
    items: [
      "<", ">", "=", "\\leq", "\\geq", "\\equiv", "\\ll", "\\gg", "\\doteq", "\\prec", "\\succ",
      "\\sim", "\\preceq", "\\succeq", "\\simeq", "\\subset", "\\supset", "\\approx", "\\subseteq",
      "\\supseteq", "\\cong", "\\sqsubset", "\\sqsupset", "\\Join", "\\sqsubseteq", "\\sqsupseteq",
      "\\bowtie", "\\in", "\\ni", "\\owns", "\\propto", "\\vdash", "\\dashv", "\\models", "\\mid",
      "\\parallel", "\\perp", "\\smile", "\\frown", "\\asymp", ":", "\\notin", "\\neq",
    ],
  },
  {
    id: "binary-operators",
    label: "3.5 二元运算符",
    items: [
      "+", "-", "\\pm", "\\mp", "\\triangleleft", "\\triangleright", "\\cdot", "\\div", "\\times",
      "\\setminus", "\\star", "\\cup", "\\cap", "\\ast", "\\sqcup", "\\sqcap", "\\circ", "\\vee",
      "\\lor", "\\wedge", "\\land", "\\bullet", "\\oplus", "\\ominus", "\\diamond", "\\odot",
      "\\oslash", "\\uplus", "\\otimes", "\\bigcirc", "\\amalg", "\\bigtriangleup", "\\bigtriangledown",
      "\\dagger", "\\ddagger", "\\wr", "\\lhd", "\\rhd", "\\unlhd", "\\unrhd",
    ],
  },
  {
    id: "large-operators",
    label: "3.6 大尺寸运算符",
    items: [
      "\\sum", "\\prod", "\\coprod", "\\int", "\\oint", "\\bigcup", "\\bigcap", "\\bigsqcup",
      "\\bigvee", "\\bigwedge", "\\biguplus", "\\bigoplus", "\\bigotimes", "\\bigodot",
    ],
  },
  {
    id: "arrows",
    label: "3.7 箭头",
    items: [
      "\\leftarrow", "\\gets", "\\rightarrow", "\\to", "\\leftrightarrow", "\\Leftarrow", "\\Rightarrow",
      "\\Leftrightarrow", "\\mapsto", "\\hookleftarrow", "\\hookrightarrow", "\\leftharpoonup",
      "\\leftharpoondown", "\\rightharpoonup", "\\rightharpoondown", "\\rightleftharpoons", "\\longleftarrow",
      "\\longrightarrow", "\\longleftrightarrow", "\\Longleftarrow", "\\Longrightarrow", "\\Longleftrightarrow",
      "\\longmapsto", "\\iff", "\\uparrow", "\\downarrow", "\\updownarrow", "\\Uparrow", "\\Downarrow",
      "\\Updownarrow", "\\nearrow", "\\searrow", "\\swarrow", "\\nwarrow", "\\leadsto",
    ],
  },
  {
    id: "delimiters",
    label: "3.8 定界符",
    items: [
      "(", ")", "[", "]", "\\{", "\\}", "\\langle", "\\rangle", "|", "\\Vert", "\\lfloor",
      "\\rfloor", "\\lceil", "\\rceil", "/", "\\backslash", "\\uparrow", "\\downarrow", "\\updownarrow",
      "\\Uparrow", "\\Downarrow", "\\Updownarrow",
    ],
  },
  {
    id: "large-delimiters",
    label: "3.9 大尺寸定界符",
    items: ["\\lgroup", "\\rgroup", "\\lmoustache", "\\rmoustache", "\\arrowvert", "\\Arrowvert", "\\bracevert"],
  },
  {
    id: "misc",
    label: "3.10 其它符号",
    items: [
      "\\dots", "\\cdots", "\\vdots", "\\ddots", "\\hbar", "\\imath", "\\jmath", "\\ell", "\\Re",
      "\\Im", "\\aleph", "\\wp", "\\forall", "\\exists", "\\mho", "\\partial", "\\prime",
      "\\emptyset", "\\infty", "\\nabla", "\\triangle", "\\Box", "\\Diamond", "\\bot", "\\top",
      "\\angle", "\\surd", "\\diamondsuit", "\\heartsuit", "\\clubsuit", "\\spadesuit", "\\neg",
      "\\flat", "\\natural", "\\sharp",
    ],
  },
  {
    id: "non-math",
    label: "3.11 非数学符号",
    // 原表中的文本模式命令并非都能由 MathJax 在数学环境中解析。
    // 剑号使用等价的数学命令，其余保留为可直接用于数学环境的 Unicode 字符。
    items: ["\\dagger", "\\ddagger", "\\S", "¶", "©", "£"],
  },
  {
    id: "ams-delimiters",
    label: "3.12 AMS 定界符",
    items: ["\\ulcorner", "\\urcorner", "\\llcorner", "\\lrcorner", "\\lvert", "\\rvert", "\\lVert", "\\rVert"],
  },
  {
    id: "ams-letters",
    label: "3.13 AMS 希腊和希伯来字母",
    items: ["\\digamma", "\\varkappa", "\\beth", "\\daleth", "\\gimel"],
  },
  {
    id: "ams-relations",
    label: "3.14 AMS 二元关系符",
    items: [
      "\\lessdot", "\\gtrdot", "\\doteqdot", "\\leqslant", "\\geqslant", "\\risingdotseq",
      "\\eqslantless", "\\eqslantgtr", "\\fallingdotseq", "\\leqq", "\\geqq", "\\eqcirc", "\\lll",
      "\\ggg", "\\circeq", "\\lesssim", "\\gtrsim", "\\triangleq", "\\lessapprox", "\\gtrapprox",
      "\\bumpeq", "\\lessgtr", "\\gtrless", "\\Bumpeq", "\\lesseqgtr", "\\gtreqless", "\\thicksim",
      "\\lesseqqgtr", "\\gtreqqless", "\\thickapprox", "\\preccurlyeq", "\\succcurlyeq", "\\approxeq",
      "\\curlyeqprec", "\\curlyeqsucc", "\\backsim", "\\precsim", "\\succsim", "\\backsimeq",
      "\\precapprox", "\\succapprox", "\\vDash", "\\subseteqq", "\\supseteqq", "\\Vdash", "\\Subset",
      "\\Supset", "\\Vvdash", "\\backepsilon", "\\therefore", "\\because", "\\varpropto", "\\shortmid",
      "\\shortparallel", "\\between", "\\smallsmile", "\\smallfrown", "\\pitchfork", "\\vartriangleleft",
      "\\vartriangleright", "\\trianglelefteq", "\\trianglerighteq", "\\blacktriangleleft", "\\blacktriangleright",
    ],
  },
  {
    id: "ams-arrows",
    label: "3.15 AMS 箭头",
    items: [
      "\\dashleftarrow", "\\dashrightarrow", "\\multimap", "\\leftleftarrows", "\\rightrightarrows", "\\upuparrows",
      "\\leftrightarrows", "\\rightleftarrows", "\\downdownarrows", "\\Lleftarrow", "\\Rrightarrow",
      "\\upharpoonleft", "\\upharpoonright", "\\twoheadleftarrow", "\\twoheadrightarrow", "\\leftarrowtail",
      "\\rightarrowtail", "\\downharpoonleft", "\\downharpoonright", "\\leftrightharpoons", "\\rightleftharpoons",
      "\\Lsh", "\\Rsh", "\\rightsquigarrow", "\\looparrowleft", "\\looparrowright", "\\leftrightsquigarrow",
      "\\curvearrowleft", "\\curvearrowright", "\\circlearrowleft", "\\circlearrowright",
    ],
  },
  {
    id: "ams-negated-relations",
    label: "3.16 AMS 二元否定关系符和箭头",
    items: [
      "\\nless", "\\ngtr", "\\varsubsetneqq", "\\varsupsetneqq", "\\lneq", "\\gneq", "\\nleq", "\\ngeq",
      "\\nsubseteqq", "\\nsupseteqq", "\\nleqslant", "\\ngeqslant", "\\lneqq", "\\gneqq", "\\nmid",
      "\\lvertneqq", "\\gvertneqq", "\\nparallel", "\\nleqq", "\\ngeqq", "\\nshortmid", "\\lnsim",
      "\\gnsim", "\\nshortparallel", "\\lnapprox", "\\gnapprox", "\\nsim", "\\nprec", "\\nsucc", "\\ncong",
      "\\npreceq", "\\nsucceq", "\\nvdash", "\\precneqq", "\\succneqq", "\\nvDash", "\\precnsim",
      "\\succnsim", "\\nVdash", "\\precnapprox", "\\succnapprox", "\\nVDash", "\\subsetneq", "\\supsetneq",
      "\\varsubsetneq", "\\varsupsetneq", "\\ntriangleleft", "\\ntriangleright", "\\nsubseteq", "\\nsupseteq",
      "\\ntrianglelefteq", "\\subsetneqq", "\\supsetneqq", "\\ntrianglerighteq", "\\nleftarrow",
      "\\nrightarrow", "\\nleftrightarrow", "\\nLeftarrow", "\\nRightarrow", "\\nLeftrightarrow",
    ],
  },
  {
    id: "ams-binary-operators",
    label: "3.17 AMS 二元运算符",
    items: [
      "\\dotplus", "\\centerdot", "\\intercal", "\\ltimes", "\\rtimes", "\\divideontimes", "\\Cup", "\\Cap",
      "\\smallsetminus", "\\veebar", "\\barwedge", "\\doublebarwedge", "\\boxplus", "\\boxminus", "\\circleddash",
      "\\boxtimes", "\\boxdot", "\\circledcirc", "\\leftthreetimes", "\\rightthreetimes", "\\circledast",
      "\\curlyvee", "\\curlywedge",
    ],
  },
  {
    id: "ams-misc",
    label: "3.18 AMS 其它符号",
    items: [
      "\\hbar", "\\hslash", "\\Bbbk", "\\square", "\\blacksquare", "\\circledS", "\\vartriangle",
      "\\blacktriangle", "\\complement", "\\triangledown", "\\blacktriangledown", "\\Game", "\\lozenge",
      "\\blacklozenge", "\\bigstar", "\\angle", "\\measuredangle", "\\sphericalangle", "\\diagup", "\\diagdown",
      "\\backprime", "\\nexists", "\\Finv", "\\varnothing", "\\eth", "\\mho",
    ],
  },
  {
    id: "math-fonts",
    label: "3.19 数学字母",
    items: [
      "\\mathrm{ABCdef}", "\\mathit{ABCdef}", "\\mathnormal{ABCdef}", "\\mathcal{ABC}",
      "\\mathscr{ABC}", "\\mathfrak{ABCdef}", "\\mathbb{ABC}",
    ],
  },
] as const;

export const FORMULA_PRESET_COUNT = FORMULA_PRESET_GROUPS.reduce((total, group) => total + group.items.length, 0);
