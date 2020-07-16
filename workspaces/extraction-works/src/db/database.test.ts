import 'chai/register-should';
import { prettyPrint } from 'commons';
import { Url } from './database-tables';
import { createEmptyDB } from './test-utils';

describe('OpenReview Database', () => {

  // beforeEach(() => {});
  // afterEach(() => {})
  // afterAll(() => {})



  it.only('smokescreen', async (done) => {
    const db = await createEmptyDB();
    await db.runTransaction(async (db, transaction) => {
      const newEntry = await Url.create({
        url: 'blah:/blah/blah'
      }, { transaction });
      const theUrl = newEntry.url;

      prettyPrint({ theUrl });
    });


    await db.run(async () => {
      return Url.findAll()
        .then((urls) => {
          const plainUrls = urls.map(a => a.get({ plain: true }));
          prettyPrint({ plainUrls });
        });
    });


    await db.close();
    done();
  });


  it('create an order with initial order-items', async (done) => {
    // shouldn't create an orderentry without an order
    // await withDBTransaction(async (db, transaction) => {
    //   const opts = { transaction };

    //   await .OrderEntry.create(opts)
    //     .then(orderEntry => {
    //       return orderEntry;
    //     }) ;

    //   await Table.OrderEntry.findAll()
    //     .then(all => {
    //       const asObj = all.map(a => a.get({ plain: true }));
    //       prettyPrint({ asObj });
    //     })
    //     .then(done)
    // })
    done();
  });

  // it('reset database', async (done) => {});
  // it('create an empty order', async (done) => {});
  // it('update an order with a new item', async (done) => {});
  // it('track whether an order is complete', async (done) => {});

});
