import {Vue, Component, Prop, Watch} from "vue-property-decorator";

@Component
export default class App extends Vue {
  @Prop() source!: string;

  get items() {
    return [
      {icon: "lightbulb", text: "Browse"},
      {icon: "touch_app", text: "Curate"},
      {divider: true},
      {heading: "Labels"},
      {icon: "add", text: "Create new label"},
      {divider: true},
      {icon: "archive", text: "Archive"},
      {icon: "delete", text: "Trash"},
    ];
  }

  drawer: boolean = true;
}
