import Vue, { CreateElement, VNode } from 'vue';
import $ from "jquery";

import FilterWidget from '@/components/filter-engine/filter-engine.vue';
// import filterEngineState from './filter-engine-state';

import { candidateGroupF } from './dev-helpers';

import { CandidateGroup, KeyedRecordGroup } from './FilterEngine';

interface Headers {
  tags: string;
  name: string;
  callSite: string;
}
interface LogEntry {
  logType: string;
  page: number;
  headers: Headers;
}

export default Vue.extend({
  name: 'FilterEngineDev',

  props: {
  },

  components: {
    FilterWidget,
  },

  created() {

  },

  methods: {

    onFilterUpdate() {
      console.log('onFilterUpdate');
    }
  },

  computed: {

    filteredRecords(): KeyedRecordGroup[] {
      const { filteredRecords } = this.$store.getters['filteringState/all']
      return filteredRecords;
    },

  },

  mounted() {
    console.log('dev:mounted', this.$store.getters['filteringState/all']);

    $.getJSON("http://localhost:3000/tracelog-2.json", (tracelogs: LogEntry[]) => {
      // console.log("tracelogs", pp(tracelogs[0]));

      const g: CandidateGroup = {
        candidates: tracelogs,
        groupKeyFunc: (l: LogEntry) => ({ multikey: ["trace", `p${l.page+1}. ${l.headers.callSite} ${l.headers.tags}`], displayTitle: "todo" })
      };

      this.$store.commit('filteringState/addCandidateGroup', g);


      const candidates1 = candidateGroupF("foo", "alex", (g) => {
        const r = { candidate: {}, multikey: ['annot', g.name, g.tags], displayTitle: g.logType };
        return r;
      });

      this.$store.commit('filteringState/addCandidateGroup', candidates1);

    }, (err) => {
      console.log("err", err);

    });


  }
});
