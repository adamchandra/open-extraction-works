//

import { scalazed_Tree as Tree } from "../index";
// import { scalazed_Tree as Tree } from "../watrmarks.js";
// import { scalazed_Tree as Tree } from "../index";

describe("loading watrmarks.js modules", () => {

  it("draw trees", () => {
    const leaf1 = Tree.Leaf("1");
    console.log(leaf1);
    const treeStr1 =  Tree.drawTree(leaf1);
    console.log(treeStr1);

    const tree = Tree.Node("a", [
      Tree.Node("b", [
        Tree.Leaf("1"),
        Tree.Leaf("2")

      ]),
      Tree.Node("c", [
        Tree.Leaf("3"),
        Tree.Leaf("4")

      ])
    ]);
    const treeStr =  Tree.drawTree(tree);

    console.log(treeStr);

    expect(true).toEqual(true);

  });

});

