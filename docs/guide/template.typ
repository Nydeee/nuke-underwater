// Shared styling and helper boxes for the learning guide.

#let accent = rgb("#1f5f8b")

#let keyidea(body) = block(
  fill: rgb("#e8f1f8"), stroke: (left: 3pt + accent), inset: 10pt, radius: 3pt, width: 100%,
)[*Key idea.* #body]

#let analogy(body) = block(
  fill: rgb("#f3f0e6"), stroke: (left: 3pt + rgb("#a07a1f")), inset: 10pt, radius: 3pt, width: 100%,
)[*Everyday comparison.* #body]

#let caution(body) = block(
  fill: rgb("#fbeaea"), stroke: (left: 3pt + rgb("#a33")), inset: 10pt, radius: 3pt, width: 100%,
)[*How sure are we?* #body]

#let term(name, body) = block(above: 0.6em, below: 0.6em)[*#name* --- #body]

#let symbols(..rows) = table(
  columns: (auto, 1fr, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Symbol*], [*Meaning*], [*Units*]),
  ..rows.pos().flatten(),
)

#let questions(..qs) = {
  heading(level: 2, outlined: false)[Check your understanding]
  enum(..qs.pos())
}

#let answers(..items) = {
  heading(level: 3, outlined: false)[Answers]
  set text(size: 9.5pt)
  enum(..items.pos())
}

#let fig(path, caption, width: 100%) = figure(image(path, width: width), caption: caption)

#let guide(title: "", subtitle: "", body) = {
  set document(title: title)
  set page(paper: "a4", margin: (x: 2.3cm, y: 2.4cm), numbering: "1")
  set text(font: ("New Computer Modern", "Libertinus Serif"), size: 11pt, lang: "en")
  set par(justify: true, leading: 0.68em)
  set heading(numbering: (..n) => {
    let a = n.pos()
    a.at(0) = a.at(0) - 1  // chapters start at 0
    numbering("1.1", ..a)
  })
  set math.equation(numbering: "(1)")
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(1.5cm)
    text(size: 22pt, fill: accent, it)
    v(0.6cm)
  }
  show link: set text(fill: accent)

  // Title page
  page(numbering: none)[
    #v(5cm)
    #align(center)[
      #text(size: 28pt, weight: "bold", fill: accent, title) \
      #v(0.4cm)
      #text(size: 14pt, subtitle)
      #v(1cm)
      #text(size: 10pt, fill: luma(90))[Companion guide to the `nukesim` simulator. \ Generated #datetime.today().display().]
    ]
  ]
  page(numbering: none, outline(depth: 2, indent: auto))
  counter(page).update(1)
  body
}
