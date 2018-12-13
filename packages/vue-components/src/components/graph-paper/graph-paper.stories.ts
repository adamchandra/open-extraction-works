import {storiesOf} from "@storybook/vue";

import GraphPaperDev from "./graph-paper.dev.vue";
// import GraphPaper from "./graph-paper.vue";

import store from "../../store";

storiesOf("GraphPaperDev", module).add("basic", () => ({
  store,
  components: {GraphPaperDev},
  template: "<GraphPaperDev />",
  methods: {},
}));