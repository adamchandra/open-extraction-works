import {
  ref,
  Ref,
  onMounted,
} from '@vue/composition-api';


// import onelineTextgrid from '~/../dev-data/textgrids/textgrid-oneline.json';
import textgrid00 from '~/../dev-data/textgrids/textgrid-00.json';

import { initState, waitFor } from '~/components/compositions/component-basics'
import { usePdfPageViewer } from '~/components/compositions/pdf-page';
import { GridTypes } from 'sharedLib';

export default {
  setup() {
    // TODO: setHoveredText
    // TODO: setClickedText

    const state = initState();

    const mountPoint: Ref<HTMLDivElement|null> = ref(null);

    const pdfPageViewer = usePdfPageViewer({ targetDivRef: mountPoint, state });

    const { imgCanvasOverlay  } = pdfPageViewer;


    onMounted(() => {
      imgCanvasOverlay.setImageSource(`http://localhost:3100/corpus-entry-0/page-images/page-1.opt.png`);
      const grid: GridTypes.Grid = textgrid00 as any as GridTypes.Grid;

      waitFor('PdfPageStory', { state }, () => {
        imgCanvasOverlay.setDimensions(910, 1213);
        pdfPageViewer.setGrid(grid, 0);
      });

    });



    return {
      mountPoint
    };
  }
}
