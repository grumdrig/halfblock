console.log(chrome.app.runtime);
chrome.app.runtime.onLaunched.addListener(function() {
  console.log('hello');
  chrome.app.window.create('window.html', {
    'width': 854,
    'height': 480
  });
});
