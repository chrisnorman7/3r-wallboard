const slideshow = {
    screens: document.getElementsByClassName("screen"),
    currentScreen: -1,
    initialTitle: document.title
}

function nextScreen() {
    slideshow.currentScreen++
    if (slideshow.currentScreen == slideshow.screens.length) {
        slideshow.currentScreen = 0
    }
    for (let i = 0; i < slideshow.screens.length; i++) {
        let screenElement = slideshow.screens[i]
        if (i == slideshow.currentScreen) {
            screenElement.hidden = false
            let h1 = screenElement.getElementsByTagName("h1")[0]
            document.title = `${slideshow.initialTitle} - ${h1.innerText}`
        } else {
            screenElement.hidden = true
        }
    }
}

this.startSlideshow = function() {
    setInterval(nextScreen, 30000)
    nextScreen()
}
