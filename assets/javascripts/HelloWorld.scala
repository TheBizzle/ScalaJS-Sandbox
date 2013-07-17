package client

import js.Dynamic.{ global => g }

object HelloWorld {
  def main(): Unit = {
    g.console.log("Hello")
    g.alert("Hey!")
    val paragraph = g.document.createElement("p")
    paragraph.updateDynamic("innerHTML")("<strong>It works!</strong>")
    g.document.getElementById("playground").appendChild(paragraph)
  }
}
