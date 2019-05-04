/* globals isSupportPerson, updateInterval, volInterval, emailInterval, smsInterval, shiftInterval, newsInterval, volunteerLink, ignoredVolunteers, stickyNewsItemColour, nonstickyNewsItemColour, volunteersCellCount, presentVolunteerNameColour, onLeaveVolunteerNameColour, presentVolunteerNameSuffix, onLeaveVolunteerNameSuffix, pageTitle */

let version = null // Used for updates.

// Lots of URLS:
const baseURL = `${location.protocol}//${location.host}/`
const versionURL = baseURL + "version"
const directoryURL = baseURL + "directory/"
const shiftURL = baseURL + "shifts"
const newsURL = baseURL + "news"

// Store where abouts we are in the list of news items.
let newsIndex = -1

// Various elements on the page:
const main = document.getElementById("main")
const loading = document.getElementById("loading")
const errorDiv = document.getElementById("error")
const newsTitle = document.getElementById("newsTitle")
const newsCreator = document.getElementById("newsCreator")
const newsBody = document.getElementById("newsBody")
const shiftsTable = document.getElementById("shiftsTable")
const shiftsStatus = document.getElementById("shiftsStatus")
const specialShifts = document.getElementById("specialShifts")
const previousShift = document.getElementById("previousShift")
const currentShift = document.getElementById("currentShift")
const nextShift = document.getElementById("nextShift")
const listenersTable = document.getElementById("listeners")
const supportsTable = document.getElementById("supports")

function clearElement(e) {
    // A function to clear all children from an element.
    while (e.childElementCount) {
        e.removeChild(e.firstChild)
    }
}

function loadJSON(url, func, onerror) {
    // Load JSON from url, and pass it through func.
    // If anything goes wrong, call onerror.
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => {
        loading.hidden = true
        errorDiv.hidden = true
        main.hidden = false
        let j = null
        try {
            j = JSON.parse(req.response)
        }
        catch (err) {
            onerror()
            return // Don't call fuck with null.
        }
        func(j) // Send the json.
    }
    req.onerror = () => {
        main.hidden = true
        errorDiv.hidden = false
        onerror()
    }
    req.send()
}

function getVersion(func) {
    // A function to get a unique number that (when changed), tells this page to reload.
    let req = new XMLHttpRequest()
    req.onload = () => {
        loading.hidden = true // Hide the loading text.
        main.hidden = false // Show the main page.
        func(req.response)
    }
    req.open("GET", versionURL)
    req.send()
}

const tasks = [] // A list of all tasks that are running.

function startTask(func, interval) {
    // A function to start a task at the specified interval, and call the function for the first time.
    tasks.push(setInterval(func, interval)) // Save the ID.
    func() // And call it for the first time.
}

function stopTasks() {
    // Stop all running tasks.
    while (tasks.length) {
        // Pop a task and cancel it.
        clearInterval(tasks.pop())
    }
}

function startTasks() {
    // Put any tasks that should run here.
    stopTasks()
    startTask(() => { // Check version and reload the page if necessary.
        document.title = pageTitle
        if (version !== null) { // Initially set by window.onload.
            getVersion((value) => {
                if (value != version) { // The server has been updated.
                    location.reload() // Get the new version.
                }
            })
        }
    }, updateInterval)
    startTask(loadVolunteers, volInterval)
    startTask(loadEmailStats, emailInterval)
    startTask(loadSmsStats, smsInterval)
    startTask(loadShifts, shiftInterval)
    startTask(() => { // Load the news.
        loadJSON(newsURL, (data) => {
            newsIndex += 1 // Increment so we show a different article every time.
            // Don't use == (which would make perfect sense), in case someone removes a news article.
            if (newsIndex >= data.length) { // We've popped off the end.
                newsIndex = 0 // So go back to the start.
            }
            let newsItem = data[newsIndex] // Find us an article.
            if (newsItem.sticky) { // Make it yellow!
                newsBody.style.backgroundColor = stickyNewsItemColour
            } else {
                newsBody.style.backgroundColor = nonstickyNewsItemColour
            }
            newsTitle.innerText = newsItem.title
            newsCreator.innerText = `${newsItem.creator.name} (${new Date(newsItem.created_at)})`
            newsBody.innerHTML = newsItem.body // News items come out in HTML.
        })
    }, newsInterval)
}

window.onload = () => {
    main.hidden = true
    loading.hidden = false
    errorDiv.hidden = true
    shiftsTable.hidden = true // Hide the shifts table until it's loaded.
    getVersion((value) => {
        loading.hidden = false // Hide the main page.
        version = value // Set initial version.
    })
    startTasks() // Start all the tasks.
}

function loadShifts() {
    loadJSON(shiftURL, (data) => { // Get a list of shift objects.
        shiftsTable.hidden = false // Show the goods.
        shiftsStatus.hidden = true // Hide that pesky message.
        for (let tag of [specialShifts, previousShift, currentShift, nextShift]) { // Clear the tables.
            clearElement(tag)
        }
        let ss = [] // Special shifts.
        let ps = [] // Previous shifts.
        let cs = [] // Current shifts.
        let ns = [] // Next shifts.
        for (let shift of data) { // Finally deal with the list.
            let shiftType = shift.type // This will tell us which list to put it in.
            if (shiftType == "past") {
                ps.push(shift)
            } else if (shiftType == "special") {
                ss.push(shift)
            } else if (shiftType == "present") {
                cs.push(shift)
            } else if (shiftType == "future") {
                ns.push(shift)
            } else {
                throw Error(`Invalid shift type: ${shiftType}.`) // Probably someone made a mistake when editing main.py.
            }
        }
        for (let [shifts, cell] of         [ // Combine the list of shift objects with a tag to add them to.
            [ss, specialShifts],
            [ps, previousShift],
            [cs, currentShift],
            [ns, nextShift]
        ]) {
            for (let shift of shifts.sort((a, b) => { // Sort the shifts by name.
                if (a.name == b.name) { // They're the same.
                    return 0
                } else if (a.name < b.name) { // Shift a should appear before shift b.
                    return -1
                } else { // Shift b should appear before shift a.
                    return 1
                }
            })) {
                let h3 = document.createElement("h3")
                h3.innerText = `${shift.name} (${shift.time})`
                cell.appendChild(h3)
                for (let volunteer of shift.volunteers) {
                    let h4 = document.createElement("h4")
                    h4.innerText = volunteer.name
                    cell.appendChild(h4)
                    cell.appendChild(volunteerLink(volunteer))
                    let p = document.createElement("p")
                    for (let detail of volunteer.details) {
                        let string = `${detail.name}: ${detail.value}`
                        let value = null
                        if (detail.name.startsWith("Telephone")) {
                            value = document.createElement("a")
                            value.innerText = string
                            value.href = `tel:${detail.value.replace(" ", "")}`
                        } else {
                            value = document.createTextNode(string)
                        }
                        p.appendChild(value)
                        p.appendChild(document.createElement("br"))
                    }
                    cell.appendChild(p)
                }
            }
        }
    }, () => {
        shiftsStatus.hidden = false // Let everyone know we're loading.
        shiftsTable.hidden = true // Hide it before we load again.
    })
}

function loadVolunteers() {
    // Load all pictures and volunteer names to the listeners and supports tables.
    loadJSON(directoryURL, (data) => { // Get a list of volunteer objects.
        for (let tag of [listenersTable, supportsTable]) { // Clear them.
            while (tag.rows.length) {
                tag.deleteRow(0)
            }
        }
        for (let volunteer of data) {
            if (ignoredVolunteers.includes(volunteer.name)) { // Skip over them.
                continue
            }
            let table = null // They could go into either table at this point.
            let volunteerType = null // Eventually used as a class name.
            if (isSupportPerson(volunteer)) {
                volunteerType  = "support-volunteer"
                table = supportsTable
            } else {
                volunteerType  = "listening-volunteer"
                table = listenersTable
            }
            let row = table.rows[table.rows.length - 1] // Get the last row in the table Might not exist yet.
            if (
                row === undefined // No rows have been created yet.
                || row.cells.length == volunteersCellCount // The table is as wide as settings allow.
            ) {
                row = table.insertRow(-1) // Create a new (or the first) row.
                row.role = "row" // Make it play nice with screenreaders.
            }
            let cell = row.insertCell(-1) // Create a cell.
            cell.role = "gridcell" // Make it play nice with screen readers.
            cell.id = volunteer.id // Probably won't use these, but we've got access to them, so might as well include them.
            cell.style.textAlign = "center" // Ensure our text ends up in the middle.
            cell.classList.add("volunteer") // Make all volunteers equal in the eyes of the class.
            cell.classList.add(volunteerType) // Differentiate between listeners and supports with the class we made earlier.
            cell.appendChild(volunteerLink(volunteer)) // Add a link to the directory.
            cell.appendChild(document.createElement("br")) // And a blank line.
            let div = document.createElement("div") // Use a div so we can modify the style.
            div.innerText = volunteer.name
            if (volunteer.on_leave) {
                if (onLeaveVolunteerNameColour !== null) {
                    div.style.color = onLeaveVolunteerNameColour
                }
                div.innerText += onLeaveVolunteerNameSuffix
            } else {
                if (presentVolunteerNameColour !== null) {
                    div.style.color = presentVolunteerNameColour
                }
                div.innerText += presentVolunteerNameSuffix
            }
            cell.appendChild(div) // Finally add the div to the cell below the image.
        }
    })
}

function loadTextTable(data, unanswered, oldest) {
    // Used to load both SMS and email statistics. All arguments should be dom elements.
    unanswered.innerText = data.unanswered
    let o = data.oldest
    oldest.innerText = o
    // Use a traffic light system to give a visual indicator of how urgent it is to start working on messages.
    // Less than 2 hours, use green as the colour and show the text at a medium size.
    // All the way up to 4 hours or more, the text turns black and gets massive.
    let hours = Number(o.split(":")[0]) // The number of hours the oldest message has been hanging around.
    let fs = null // Font size.
    let bg = null // Background colour.
    if (hours < 2) {
        fs = "medium"
        bg = "green"
    } else if (hours < 3) {
        fs = "large"
        bg = "orange"
    } else if (hours < 4) {
        fs = "x-large"
        bg = "red"
    } else {
        fs = "xx-large"
        bg = "black"
    }
    for (let style of [unanswered.style, oldest.style]) { // Colour everything.
        style.color = "white" // Set the text colour first.
        style.fontSize = fs // Set font size.
        style.background = bg // Set background colour.
    }
}

function loadEmailStats() {
    // Load email statistics and pass them through loadTextTable.
    loadJSON(
        baseURL + "email/",
        (data) => loadTextTable(data, document.getElementById("unansweredEmail"), document.getElementById("oldestEmail"))
    )
}

function loadSmsStats() {
    // Load SMS statistics and pass them through loadTextTable.
    loadJSON(
        baseURL + "sms/",
        (data) => loadTextTable(data, document.getElementById("unansweredSms"), document.getElementById("oldestSms"))
    )
}
