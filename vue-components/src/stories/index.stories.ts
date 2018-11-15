/* eslint-disable import/no-extraneous-dependencies */
import { storiesOf } from '@storybook/vue';
import { action } from '@storybook/addon-actions';
import { linkTo } from '@storybook/addon-links';
import store from '../store';

// import MyButton from '../components/MyButton.vue';

// storiesOf('Button', module)
//   .add('with text', () => ({
//     components: { MyButton },
//     template: '<my-button @click="action">Hello Button</my-button>',
//     methods: { action: action('clicked') }
//   }))
//   .add('with some emoji', () => ({
//     components: { MyButton },
//     template: '<my-button @click="action">😀 😎 👍 💯</my-button>',
//     methods: { action: action('clicked') }
//   }))
// ;



import FilterEngineDev from '../components/filter-engine/filter-engine.dev.vue';


storiesOf('FilterWidget', module)
  .add('basic', () => ({
    store,
    components: { FilterEngineDev },
    template: '<FilterEngineDev />',
    methods: {}
  }));
