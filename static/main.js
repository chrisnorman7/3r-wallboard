/* globals isSupportPerson, updateInterval, volInterval, emailInterval, smsInterval, shiftInterval, newsInterval, volunteerLink, ignoredVolunteers */

let version = null

const baseURL = `${location.protocol}//${location.host}/`
const versionURL = baseURL + "version"
const directoryURL = baseURL + "directory/"
const shiftURL = baseURL + "shifts"
const newsURL = baseURL + "news"
let newsIndex = -1

const newsTitle = document.getElementById("newsTitle")
const newsCreator = document.getElementById("newsCreator")
const newsBody = document.getElementById("newsBody")

const status = document.getElementById("status")

const shiftsTable = document.getElementById("shiftsTable")
const shiftsStatus = document.getElementById("shiftsStatus")
const specialShifts = document.getElementById("specialShifts")
const previousShift = document.getElementById("previousShift")
const currentShift = document.getElementById("currentShift")
const nextShift = document.getElementById("nextShift")

function clearElement(e) {
    while (e.childElementCount) {
        e.removeChild(e.firstChild)
    }
}

function loadJSON(url, func, onerror) {
    if (onerror !== undefined) {
        onerror = () => status.innerText = "Unable to decode JSON."
    }
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => {
        let j = null
        try {
            j = JSON.parse(req.response)
        }
        catch (err) {
            onerror()
        }
        if (j !== null) {
            func(j)
        }
    }
    req.onerror = onerror
    req.send()
}

function getVersion(func) {
    let req = new XMLHttpRequest()
    req.onload = () => func(req.response)
    req.open("GET", versionURL)
    req.send()
}

const tasks = []

function startTask(func, interval) {
    tasks.push(setInterval(func, interval))
    func()
}

function stopTasks() {
    for (let task of tasks) {
        clearInterval(task)
    }
}

function startTasks() {
    stopTasks()
    startTask(
        () => {
            if (version !== null) {
                getVersion((value) => {
                    if (value != version) {
                        location.reload()
                    }
                })
            }
        }, updateInterval
    )
    startTask(loadVolunteers, volInterval)
    startTask(loadEmailStats, emailInterval)
    startTask(loadSmsStats, smsInterval)
    startTask(loadShifts, shiftInterval)
    startTask(() => {
        loadJSON(newsURL, (data) => {
            newsIndex += 1
            if (newsIndex >= data.length) {
                newsIndex = 0
            }
            let newsItem = data[newsIndex]
            if (newsItem.sticky) {
                newsBody.style.backgroundColor = "yellow"
            } else {
                newsBody.style.backgroundColor = "white"
            }
            newsTitle.innerText = newsItem.title
            newsCreator.innerText = `${newsItem.creator.name} (${new Date(newsItem.created_at)})`
            newsBody.innerHTML = newsItem.body
        })
    }, newsInterval)
}

window.onload = () => {
    shiftsTable.hidden = true
    getVersion((value) => version = value)
    startTasks()
}

function loadShifts() {
    loadJSON(shiftURL, (data) => {
        shiftsStatus.hidden = true
        shiftsTable.hidden = false
        for (let tag of [specialShifts, previousShift, currentShift, nextShift]) {
            clearElement(tag)
        }
        for (let shift of data) {
            let shiftType = shift.type
            let cell = null
            if (shiftType == "past") {
                cell = previousShift
            } else if (shiftType == "special") {
                cell = specialShifts
            } else if (shiftType == "present") {
                cell = currentShift
            } else if (shiftType == "future") {
                cell = nextShift
            } else {
                throw Error(`Invalid shift type: ${shiftType}.`)
            }
            let tags = []
            let h3 = document.createElement("h3")
            h3.innerText = `${shift.name} (${shift.time})`
            tags.push(h3)
            for (let volunteer of shift.volunteers) {
                let h4 = document.createElement("h4")
                h4.innerText = volunteer.name
                tags.push(h4)
                tags.push(volunteerLink(volunteer))
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
                tags.push(p)
            }
            for (let tag of tags) {
                cell.appendChild(tag)
            }
        }
    }, () => {
        status.innerText = "Unable to load shifts."
        shiftsStatus.hidden = false
        shiftsTable.hidden = true
    })
}

const listenersTable = document.getElementById("listeners")
const supportsTable = document.getElementById("supports")

function loadVolunteers() {
    status.innerText = "Loading volunteer list..."
    loadJSON(directoryURL, (data) => {
        status.innerText = `Volunteers last loaded ${new Date()}.`
        for (let tag of [listenersTable, supportsTable]) {
            while (tag.rows.length) {
                tag.deleteRow(0)
            }
        }
        for (let volunteer of data) {
            if (ignoredVolunteers.includes(volunteer.name)) {
                continue
            }
            let table = null
            let volunteerType = null
            if (isSupportPerson(volunteer)) {
                volunteerType  = "support-volunteer"
                table = supportsTable
            } else {
                volunteerType  = "listening-volunteer"
                table = listenersTable
            }
            let row = table.rows[table.rows.length - 1]
            if (row === undefined || row.cells.length == 12) {
                row = document.createElement("tr")
                table.appendChild(row)
            }
            let cell = document.createElement("td")
            cell.id = volunteer.id
            cell.classList.add("volunteer")
            cell.classList.add(volunteerType)
            cell.appendChild(volunteerLink(volunteer))
            cell.appendChild(document.createElement("br"))
            let span = document.createElement("span")
            span.innerText = volunteer.name
            span.style.textAlign = "center"
            if (volunteer.on_leave) {
                span.style.color = "red"
                span.innerText += " (L)"
            }
            cell.appendChild(span)
            row.appendChild(cell)
        }
    }, () => status.innerText = "Could not get volunteer list.")
}

function loadTextTable(data, unanswered, oldest) {
    unanswered.innerText = data.unanswered
    let o = data.oldest
    let n = Number(o.split(":")[0])
    oldest.innerText = o
    let fs, bg = null
    if (n < 2) {
        fs = "medium"
        bg = "green"
    } else if (n < 3) {
        fs = "large"
        bg = "orange"
    } else if (n < 4) {
        fs = "x-large"
        bg = "red"
    } else {
        fs = "xx-large"
        bg = "black"
    }
    for (let style of [unanswered.style, oldest.style]) {
        style.color = "white"
        style.fontSize = fs
        style.background = bg
    }
}

function loadEmailStats() {
    loadJSON(
        baseURL + "email/",
        (data) => loadTextTable(data, document.getElementById("unansweredEmail"), document.getElementById("oldestEmail")),
        () => status.innerText = "Unable to retrieve email statistics"
    )
}

function loadSmsStats() {
    loadJSON(
        baseURL + "sms/",
        (data) => loadTextTable(data, document.getElementById("unansweredSms"), document.getElementById("oldestSms")),
        () => status.innerText = "Unable to retrieve SMS statistics"
    )
}
