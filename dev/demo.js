// Demo mode (index.html?demo): runs the real apps-script/Code.gs against the in-memory sheet
// from gas-mock.js, filled with the same sample data the "Add sample data" button creates.
// Nothing is saved anywhere. Loaded after gas-mock.js and Code.gs inside a hidden iframe
// (see startDemo in js/app.js), so the backend's globals stay separate from the app's.

(function () {
    const call = action => {
        const result = __call({ secret: DEMO_SECRET, action });
        if (!result.ok) throw new Error(result.error);
        return result.data;
    };
    call('list'); // creates the sheets with the default trackers and categories
    call('addSampleData');

    // The app swaps this in for fetch: answers requests from the mock sheet, with a short delay like the real thing.
    window.demoFetch = async (url, options) => {
        await new Promise(resolve => setTimeout(resolve, 350));
        const text = doPost({ postData: { contents: options.body } }).text;
        return { ok: true, json: async () => JSON.parse(text) };
    };
})();
