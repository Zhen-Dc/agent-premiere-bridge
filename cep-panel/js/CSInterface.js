/*
 * Minimal CSInterface loader shim.
 * Premiere normally provides CSInterface.js in the CEP environment. This fallback
 * keeps the panel readable if opened in a browser during diagnostics.
 */
if (typeof CSInterface === "undefined") {
  window.CSInterface = function CSInterface() {};
  CSInterface.prototype.evalScript = function evalScript(script, callback) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(script, callback);
      return;
    }
    console.log("evalScript fallback:", script);
    if (callback) callback(JSON.stringify({ ok: false, error: "CSInterface is only available inside Adobe CEP." }));
  };
}
