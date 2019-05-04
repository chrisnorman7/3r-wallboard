/* globals isSupportPerson, updateInterval, volInterval, emailInterval, smsInterval, shiftInterval, newsInterval, volunteerLink */

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
const shifts = document.getElementById("shifts")

function clearElement(e) {
    while (e.childElementCount) {
        e.removeChild(e.firstChild)
    }
}

function loadJSON(url, func, onerror) {
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => {
        let j = null
        try {
            j = JSON.parse(req.response)
        }
        catch (err) {
            status.innerText = "Unable to decode JSON."
        }
        if (j !== null) {
            func(j)
        }
    }
    req.onerror = () => {
        if (onerror !== undefined) {
            onerror()
        }
    }
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
    getVersion((value) => version = value)
    startTasks()
}

function loadShifts() {
    loadJSON(shiftURL, (data) => {
        clearElement(shifts)
        for (let shift of data) {
            let h3 = document.createElement("h3")
            h3.tabIndex = "0"
            h3.style.textAlign = "center"
            h3.innerText = `${shift.name} (${shift.time})`
            h3.id = shift.id
            shifts.appendChild(h3)
            let t = document.createElement("table")
            t.align = "center"
            let cols = shift.volunteers.length
            let rows = 0
            let data = []
            for (let i = 0; i < cols; i++) {
                let volunteer = shift.volunteers[i]
                let column = [
                    volunteer.name,
                    volunteerLink(volunteer)
                ]
                for (let detail of volunteer.details) {
                    let string = `${detail.name}: ${detail.value}`
                    let value = null
                    if (detail.name.startsWith("Telephone")) {
                        value = document.createElement("a")
                        value.innerText = string
                        value.href = `tel:${detail.value.replace(" ", "")}`
                    } else {
                        value = string
                    }
                    column.push(value)
                }
                data.push(column)
                rows = Math.max(rows, column.length)
            }
            for (let row = 0; row < rows; row++) {
                let r = document.createElement("tr")
                for (let col = 0; col < cols; col++) {
                    let tag = null
                    if (row) {
                        tag = "td"
                    } else {
                        tag = "th"
                    }
                    tag = document.createElement(tag)
                    tag.style.textAlign = "center"
                    let value = data[col][row]
                    if (value === undefined) {
                        value = document.createTextNode(" ")
                    } else if (typeof(value) == "string") {
                        value= document.createTextNode(value)
                    } else {
                        // Value is already a tag (hopefully).
                    }
                    tag.appendChild(value)
                    r.appendChild(tag)
                }
                t.appendChild(r)
            }
            shifts.appendChild(t)
        }
    }, () => status.innerText = "Unable to load shifts.")
}

const listenersTable = document.getElementById("listeners")
const supportsTable = document.getElementById("supports")

function loadVolunteers() {
    status.innerText = "Loading volunteer list..."
    loadJSON(directoryURL, (data) => {
        data = data.volunteers
        status.innerText = `Volunteers last loaded ${new Date()}.`
        for (let tag of [listenersTable, supportsTable]) {
            while (tag.rows.length) {
                tag.deleteRow(0)
            }
        }
        for (let volunteer of data.sort((a, b) => a.id - b.id)) {
            if ([
                "Sam 123", "Rotaonly"
            ].includes(volunteer.name)) {
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
            let span = document.createElement("span")
            span.style.textAlign = "center"
            span.innerText = volunteer.name
            cell.appendChild(span)
            cell.appendChild(document.createElement("br"))
            cell.appendChild(volunteerLink(volunteer))
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
