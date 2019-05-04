/* globals baseURL */

// Locals.js: Local stuff for your organisation.
//
// Modify this file to configure your organisation's notice board.

// A function to determine whether or not a particular volunteer is a member of support staff or not.
this.isSupportPerson = function(v) {
    return v.name.match(/[^- ]+[- ]S[0-9]+/)
}

// Intervals for loading stuff. All times are given in milliseconds.
//
// How often the page should check for updates.
this.updateInterval = 20000

// How often volunteers should be loaded.
this.volInterval = 3600 * 1000

// How often email stats should be checked.
this.emailInterval = 60000

// How often SMS stats should be checked.
this.smsInterval = 60000

// How often shift data should be retrieved.
this.shiftInterval = 60000

// How often news should scroll.
this.newsInterval = 1000 * 15

// This function should return a link which will be used whenever a volunteer should be clickable.
this.volunteerLink = function(volunteer, altText) {
    let a = document.createElement("a")
    a.target = "_new"
    a.href = `https://www.3r.org.uk/directory/${volunteer.id}`
    let i = document.createElement("img")
    i.src = `${baseURL}thumb/${volunteer.id}`
    if (altText === undefined) {
        altText = "View in directory"
    }
    i.alt = altText
    a.appendChild(i)
    return a
}

this.ignoredVolunteers = ["Sam 123", "Rotaonly"]
