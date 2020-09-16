import 'chai/register-should';
import path from 'path';
import _ from 'lodash';
import { prettyPrint, putStrLn } from 'commons';
import { exampleExtractionAttempt } from './extraction-process-v2';
import fs from 'fs-extra';
import cproc from 'child_process';
import { getBasicConsoleLogger } from '~/utils/basic-logging';
import { ExtractionAppContext, runAbstractFinders } from '../abstracts/extract-abstracts';
import Async from 'async';

const tmpHtml = `
<!DOCTYPE html>
<html>
<head>

<meta name="citation_author" content="Holte, Robert C." />
<meta name="citation_author" content="Burch, Neil" />
<meta name="citation_title" content="Automatic move pruning for single-agent search" />


</head>
<body>


<div style="min-width:1010px;" class="gradient"><div class="headerimage"/></div>

<div class="gradient gradientseparator"/>
<div class="content">
  <script type="text/javascript">

   var home = {
     metadata:{
       searchCount: '5,115,530',
       logoRelPath: '/customer_logos',
       thirdParthAuth: false,
       currentPage:  '',
       xploreVirtual:'https://ieeexplore.ieee.org'
     },
   };


   home.metadata.userInfo={ institute":true,"member":false,"individual":false,"guest":false };


  </script>

	<div class="subcontent">
	<h1>3D Pose-by-Detection of Vehicles via Discriminatively Reduced Ensembles of Correlation Filters</h1>

	<span class="authorlist">Yair Movshovitz-Attias, Yaser Sheikh, Vishnu Naresh Boddeti and Zijun Wei</span>

	<p>In Proceedings British Machine Vision Conference 2014<br/>
	<a href="http://dx.doi.org/10.5244/C.28.53">http://dx.doi.org/10.5244/C.28.53</a></p>
	<p>
	<h2>Abstract</h2>
	Estimating the precise pose of a 3D model in an image is challenging; explicitly identifying correspondences is difficult, particularly at smaller scales and in the presence of occlusion. Exemplar classifiers have demonstrated the potential of detection-based approaches to problems where precision is required. In particular, correlation filters explicitly suppress classifier response caused by slight shifts in the bounding box. This property makes them ideal exemplar classifiers for viewpoint discrimination, as small translational shifts can often be confounded with small rotational shifts. However, exemplar based pose-by-detection is not scalable because, as the desired precision of viewpoint estimation increases, the number of exemplars needed increases as well. We present a training framework to reduce an ensemble of exemplar correlation filters for viewpoint estimation by directly optimizing a discriminative objective. We show that the discriminatively reduced ensemble outperforms the state-of-the-art on three publicly available datasets and we introduce a new dataset for continuous car pose estimation in street scene images.
	</p>


	</div>
</div>

</body>
</html>
`;

import cheerio from 'cheerio';
describe('Field Extraction Pipeline', () => {
  const testCorpus = './test/resources/spidered-corpus';
  const testScratchDir = './test-scratch.d';

  beforeEach(() => {
    fs.emptyDirSync(testScratchDir);
    fs.rmdirSync(testScratchDir);
    fs.mkdirpSync(testScratchDir);
    // TODO don't use linux shell commands here:
    cproc.execSync(`cp -rl ${testCorpus} ${testScratchDir}/`)
  });


  it.only('trying env function composition ', async (done) => {
    // putStrLn(`queryTag> pre-load prototype=${cheerio.prototype}`);
    // const $ = cheerio.load(tmpHtml, {
    //   _useHtmlParser2: true,
    //   recognizeSelfClosing: true,
    //   normalizeWhitespace: false,
    //   xmlMode: true,
    //   decodeEntities: false
    // });
    // const queryRes = $('meta[name=citation_title]');
    // putStrLn(`queryTag> ${queryRes}`);
    // const html = queryRes.attr('content');
    // putStrLn(`queryTag> => ${html}`);

    const examples = [
      '22dae',
      // '22133',
      // '22168'
    ];
    await Async.mapSeries(examples, async example => {
      const entryPath = path.join(testScratchDir, 'spidered-corpus', example);
      await exampleExtractionAttempt(entryPath);
    });

    done();

  });
});
