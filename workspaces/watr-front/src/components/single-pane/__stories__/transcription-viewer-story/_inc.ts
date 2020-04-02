import { defineComponent } from '@vue/composition-api';
import { initState } from '~/components/basics/component-basics';
import { divRef } from '~/lib/vue-composition-lib';
import { useTranscriptionViewer } from '../../transcription-viewer';
import { getArtifactData } from '~/lib/axios';
import { Transcription } from '~/lib/transcription';
import { isRight } from 'fp-ts/lib/Either'

export default defineComponent({
  components: {},
  setup() {

    const state = initState();
    const mountPoint = divRef();

    useTranscriptionViewer({ mountPoint, state })
      .then(transcriptionViewer => {

        const { setText } = transcriptionViewer;

        const entryId = '1503.00580.pdf.d';
        // TODO get /transcript
        getArtifactData(entryId, 'textgrid')
          .then((transcriptJson) => {
            const transEither  = Transcription.decode(transcriptJson);

            if (isRight(transEither)) {
              const trans = transEither.right;
              const page0 = trans.pages[0];
              setText({ trPage: page0, textMarginLeft: 20, textMarginTop: 20 });
            }
          });
      });

    return {
      mountPoint
    };
  }
});
